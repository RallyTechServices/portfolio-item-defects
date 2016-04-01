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

        var cb = Ext.create('Rally.ui.combobox.ComboBox',{
            storeConfig: {
                model: portfolioItemType,
                fetch: ['FormattedID','ObjectID','Name'],
                remoteFilter: false,
                autoLoad: true
            },
            fieldLabel: 'Portfolio Item',
            itemId: 'portfolio-item-selector',
            allowNoEntry: true,
            noEntryValue: null,
            noEntryText: '-- All Portfolio Defects --',
            margin: 10,
            valueField: 'ObjectID',
            displayField: 'FormattedID',
            stateful: true,
            stateId: 'cb-pi-selector',
            width: 400,
            listConfig: {
                itemTpl: '<tpl if="Name">{FormattedID}: {Name}<tpl else>{FormattedID}</tpl>'
            },
            filterProperties: ['Name','FormattedID'],
            fieldCls: 'pi-selector',
            displayTpl: '<tpl for=".">' +
            '<tpl if="Name">{[values["FormattedID"]]}: {[values["Name"]]}' +
            '<tpl else>{[values["FormattedID"]]}</tpl>' +
            '<tpl if="xindex < xcount">,</tpl>' +
            '</tpl>'
        });
        this.selector = this.add(cb);

        this.selector.on('change', this._fetchUserStories, this);

        if (cb.getValue() === null){
            this._fetchUserStories(cb);
        }
    },
    _showError: function(msg){
        Rally.ui.notify.Notifier.showError({message: msg});
    },
    _fetchUserStories: function(cb){
        this.logger.log('_fetchUserStories', cb.getValue());
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

        var propertySegments = [this._getFeatureFieldName()];
        for (var i=0; i<idx; i++){
            propertySegments.push('Parent');
        }
        propertySegments.push('ObjectID');

        if (idx < 0){
            //something is wrong...
        }

        var operator = ">",
            value = 0;

        if (portfolioItem && portfolioItem.get('ObjectID') > 0){
            operator = "=";
            value = portfolioItem.get('ObjectID');
        }
        var filters = [{
            property: propertySegments.join('.'),
            operator: operator,
            value: value
        }];

        this.logger.log('_getUserStoryConfigs', portfolioItem, model, idx, propertySegments, filters);
        return {
            model: model,
            fetch: ['ObjectID','Defects'],
            filters: filters,
            limit: 'Infinity'
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
            models: ['defect'],
            enableHierarchy: true,

            fetch: this.defectFetch,
            filters: filters,
            limit: 'Infinity'
        };
    },
    _getPortfolioItemLevel: function(){

        var idx = -1,
            type = this.getSetting('selectedPortfolioType').toLowerCase();

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
        var me = this;
        if (this.down('rallygridboard')){
            this.down('rallygridboard').destroy();
        }

        var modelNames = ['defect'];
        Ext.create('Rally.data.wsapi.TreeStoreBuilder').build(storeConfig).then({
            success: function(store){
                var gb = this.add({
                    xtype: 'rallygridboard',
                    context: this.getContext(),
                    modelNames: modelNames,
                    toggleState: 'grid',
                    plugins: [{
                        ptype: 'rallygridboardcustomfiltercontrol',
                        headerPosition: 'right',
                        filterControlConfig: {
                            modelNames: modelNames,
                            stateful: true,
                            stateId: this.getContext().getScopedStateId('defect-grid-filter')
                        },
                        showOwnerFilter: false
                    },{
                        ptype: 'rallygridboardfieldpicker',
                        headerPosition: 'right',
                        modelNames: modelNames,
                        stateful: true,
                        stateId: this.getContext().getScopedStateId('defect-grid-columns')
                    }],
                    gridConfig: {
                        store: store,
                        storeConfig: {filters: storeConfig.filters },
                        columnCfgs: this._getColumnCfgs()
                    },
                    height: this.getHeight(),
                    listeners: {
                        afterrender: me._moveSelector,
                        beforedestroy: me._removeSelector,
                        scope: me
                    }
                });

            },
            scope: this
        });

    },
    _removeSelector: function(gb){
        this.logger.log('_removeSelector', gb);
        if (this.selector && this.selector.rendered) {
            var parent = this.selector.up();
            if(parent && parent.remove){
                parent.remove(this.selector, false);
            }
        }
    },
    _moveSelector: function(gb){
        this.logger.log('_moveSelector', gb);

        var header = gb.getHeader();

        if (header) {
            header.getLeft().add(this.selector);
        }
    },
    _getColumnCfgs: function(){
        return [{
            dataIndex: 'Name',
            text: 'Name',
            flex: 1
        }, {
            dataIndex: 'State',
            text: 'State'
        }, {
            dataIndex: 'Requirement',
            text: 'User Story'
        }, {
            dataIndex: 'Severity',
            text: 'Severity'
        }, {
            dataIndex: 'Priority',
            text: 'Priority'
        }, {
            dataIndex: 'OpenedDate',
            text: 'Opened Date'
        }, {
            dataIndex: 'Project',
            text: 'Project'
        }];
    },
    getSettingsFields: function(){
        return [{
            name: 'selectedPortfolioType',
            xtype: 'rallycombobox',
            labelAlign: 'right',
            labelWidth: 175,
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
            labelWidth: 175,
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
