Ext.define("portfolio-item-defects", {
    extend: 'Rally.app.App',
    componentCls: 'app',
    logger: new Rally.technicalservices.Logger(),
    defaults: { margin: 10 },
    config: {
        defaultSettings: {
            selectedPortfolioType: 'PortfolioItem/Theme',
            defectQuery: ''
        }
    },

    integrationHeaders : {
        name : "portfolio-item-defects"
    },

    defectFetch: ['ObjectID','FormattedID','Name','State'],

    launch: function() {
        Rally.technicalservices.Toolbox.fetchPortfolioItemTypes().then({
            success: function(portfolioItemTypes){
                this.portfolioItemTypes = portfolioItemTypes;
                this._addSelector();
            },
            failure: function(msg){
                this._showError(msg);
            },
            scope: this
        });
    },
    _addSelector: function(){
        var portfolioItemType = this.getSetting('selectedPortfolioType');
        this.removeAll();
        var cb = this.add({
            xtype: 'rallycombobox',
            storeConfig: {
                model: portfolioItemType,
                remoteFilter: false,
                autoLoad: true
            },
            width: 300
        });
        cb.on('change', this._fetchUserStories, this);
    },
    _showError: function(msg){
        Rally.ui.notify.Notifier.showError({message: msg});
    },
    _fetchUserStories: function(cb){
        var portfolioItem = cb.getRecord(),
            config = this._getUserStoryConfig(portfolioItem);

            Rally.technicalservices.Toolbox.fetchWsapiRecords(config).then({
                success: function(records){
                    this.logger.log('_fetchUserStories', config, records);
                    var defectConfig = this._getDefectConfig(records);

                    this._displayGrid(defectConfig);

                },
                failure: function(msg){
                    this._showError(msg);
                },
                scope: this
            });
    },
    _getUserStoryConfig: function(portfolioItem){
        var model = 'HierarchicalRequirement',
            idx = this._getPortfolioItemLevel(portfolioItem);

        if (idx < 0){
            //something's wrong
        }

        var propertySegments = [this._getFeatureFieldName()];
        for (var i=0; i<idx; i++){
            propertySegments.push('Parent');
        }
        propertySegments.push('ObjectID');

        var filters = [{
            property: propertySegments.join('.'),
            value: portfolioItem.get('ObjectID')
        }];

        this.logger.log('_getUserStoryConfigs', model, idx, propertySegments, filters);
        return {
            model: model,
            fetch: ['ObjectID','Defects'],
            filters: filters,
            limit: 'Infinity',
            listeners: {
                scope: this,
                load: function(records, operation){
                    console.log('records', records, operation);
                }
            }
        };
    },
    _getDefectConfig: function(userStories){
        var model = 'Defect';

        var filters = _.filter(userStories, function(us){
            return us.get('Defects') && us.get('Defects').Count > 0;
        }).map(function(us){ return {
                property: 'Requirement.ObjectID',
                value: us.get('ObjectID')
            };
        });

        this.logger.log('_getDefectConfig', userStories.length, model, filters.length);
        if (filters.length === 0) {
            filters = [{property: 'ObjectID', value: 0}];
        }

        filters = Rally.data.wsapi.Filter.or(filters);
        var query = this.getSetting('defectQuery');
        if (query && query.length > 0){
            filters = filters.and(Rally.data.wsapi.Filter.fromQueryString(query));
        }

        this.logger.log('_getDefectConfig', query, filters.toString());

        return {
            model: model,
            fetch: this.defectFetch,
            filters: filters,
            limit: 'Infinity',
            listeners: {
                scope: this,
                load: function(records, operation){
                    console.log('records', records, operation);
                }
            }
        };
    },
    _getPortfolioItemLevel: function(portfolioItem){
        var idx = -1,
            type = portfolioItem.get('_type').toLowerCase();

        for (var i=0; i<this.portfolioItemTypes.length; i++){
            if (type === this.portfolioItemTypes[i].TypePath.toLowerCase()){
                idx = i;
                i = this.portfolioItemTypes.length;
            }
        }
        return idx;
    },
    _getFeatureFieldName: function(){
        this.logger.log('_getFeatureFieldName',this.portfolioItemTypes[0].TypePath,this.portfolioItemTypes[0].TypePath.replace("PortfolioItem/",""));
        return this.portfolioItemTypes[0].TypePath.replace("PortfolioItem/","");
    },
    _displayGrid: function(storeConfig){

        if (this.down('rallygrid')){
            this.down('rallygrid').destroy();
        }

        this.add({
            xtype: 'rallygrid',
            storeConfig: storeConfig,
            columnCfgs: this._getColumnCfgs()
        });

    },
    _getColumnCfgs: function(){
        return [{
            dataIndex: 'FormattedID',
            text: 'ID'
        },{
            dataIndex: 'Name',
            text: 'Name',
            flex: 1
        }, {
            dataIndex: 'State',
            text: 'State'
        }];
    },
    getSettingsFields: function(){
        return [{
            name: 'selectedPortfolioType',
            xtype: 'rallycombobox',
            labelAlign: 'right',
            labelWidth: 150,
            allowBlank: false,
            autoSelect: false,
            fieldLabel: 'Selected Portfolio Item Type',
            storeConfig: {
                model: Ext.identityFn('TypeDefinition'),
                sorters: [{ property: 'DisplayName' }],
                fetch: ['DisplayName', 'ElementName', 'TypePath', 'Parent', 'UserListable'],
                filters: [{property: 'TypePath', operator: 'contains', value: 'PortfolioItem/'}],
                autoLoad: false,
                remoteSort: false,
                remoteFilter: true
            },
            displayField: 'DisplayName',
            valueField: 'TypePath'
        },{
            xtype: 'textarea',
            fieldLabel: 'Defect Query',
            labelAlign: 'right',
            labelWidth: 150,
            name: 'defectQuery',
            anchor: '100%',
            cls: 'query-field',
            margin: '0 70 0 0',
            plugins: [
                {
                    ptype: 'rallyhelpfield',
                    helpId: 194
                },
                'rallyfieldvalidationui'
            ],
            validateOnBlur: false,
            validateOnChange: false,
            validator: function(value) {
                try {
                    if (value) {
                        Rally.data.wsapi.Filter.fromQueryString(value);
                    }
                    return true;
                } catch (e) {
                    return e.message;
                }
            }
        }];
    },
    getOptions: function() {
        return [
            {
                text: 'About...',
                handler: this._launchInfo,
                scope: this
            }
        ];
    },

    _launchInfo: function() {
        if ( this.about_dialog ) { this.about_dialog.destroy(); }
        this.about_dialog = Ext.create('Rally.technicalservices.InfoLink',{});
    },

    isExternal: function(){
        return typeof(this.getAppId()) == 'undefined';
    },

    //onSettingsUpdate:  Override
    onSettingsUpdate: function (settings){
        this.logger.log('onSettingsUpdate',settings);
        // Ext.apply(this, settings);
        this.launch();
    }
});