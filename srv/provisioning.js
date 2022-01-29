const debug = require('debug')('srv:provisioning');
const credStore = require('./lib/credStore');
const cfenv = require('cfenv');
const appEnv = cfenv.getAppEnv();
const xsenv = require('@sap/xsenv');
xsenv.loadEnv();
const services = xsenv.getServices({
    registry: { tag: 'SaaS' }
    ,
    dest: { tag: 'destination' }
});

const axios = require('axios');
const qs = require('qs');

async function getCFInfo(appname) {
    try {
        // get authentication url
        let options = {
            method: 'GET',
            url: appEnv.app.cf_api + '/info'
        };
        let res = await axios(options);
        try {
            // get access token
            let creds1 = await credStore.readCredential('app26012022', 'password', 'CFAPI');
            let options1 = {
                method: 'POST',
                url: res.data.authorization_endpoint + '/oauth/token?grant_type=password',
                data: qs.stringify({
                    username: creds1.username,
                    password: creds1.value
                }),
                headers: {
                    'Authorization': 'Basic ' + Buffer.from('cf:').toString('base64'),
                    'Content-Type': 'application/x-www-form-urlencoded'
                }
            };
            let res1 = await axios(options1);
            try {
                // get app guid
                let options2 = {
                    method: 'GET',
                    url: appEnv.app.cf_api + '/v3/apps?organization_guids=' + appEnv.app.organization_id + '&space_guids=' + appEnv.app.space_id + '&names=' + appname,
                    headers: {
                        'Authorization': 'Bearer ' + res1.data.access_token
                    }
                };
                let res2 = await axios(options2);
                try {
                    // get domain guid
                    let options3 = {
                        method: 'GET',
                        url: appEnv.app.cf_api + '/v3/domains?names=' + /\.(.*)/gm.exec(appEnv.app.application_uris[0])[1],
                        headers: {
                            'Authorization': 'Bearer ' + res1.data.access_token
                        }
                    };
                    let res3 = await axios(options3);
                    let results = {
                        'access_token': res1.data.access_token,
                        'app_id': res2.data.resources[0].guid,
                        'domain_id': res3.data.resources[0].guid
                    };
                    return results;
                } catch (err) {
                    debug(err.stack);
                    return err.message;
                }
            } catch (err) {
                debug(err.stack);
                return err.message;
            }
        } catch (err) {
            debug(err.stack);
            return err.message;
        }
    } catch (err) {
        debug(err.stack);
        return err.message;
    }
};

async function createRoute(tenantHost, appname) {
    getCFInfo(appname).then(
        async function (CFInfo) {
            try {
                // create route
                let options = {
                    method: 'POST',
                    url: appEnv.app.cf_api + '/v3/routes',
                    data: {
                        'host': tenantHost,
                        'relationships': {
                            'space': {
                                'data': {
                                    'guid': appEnv.app.space_id
                                }
                            },
                            'domain': {
                                'data': {
                                    'guid': CFInfo.domain_id
                                }
                            }
                        }
                    },
                    headers: {
                        'Authorization': 'Bearer ' + CFInfo.access_token,
                        'Content-Type': 'application/json'
                    }
                };
                let res = await axios(options);
                try {
                    // map route to app
                    let options2 = {
                        method: 'POST',
                        url: appEnv.app.cf_api + '/v3/routes/' + res.data.guid + '/destinations',
                        data: {
                            'destinations': [{
                                'app': {
                                    'guid': CFInfo.app_id
                                }
                            }]
                        },
                        headers: {
                            'Authorization': 'Bearer ' + CFInfo.access_token,
                            'Content-Type': 'application/json'
                        }
                    };
                    let res2 = await axios(options2);
                    console.log('Route created for ' + tenantHost);
                    return res2.data;
                } catch (err) {
                    debug(err.stack);
                    return err.message;
                }
            } catch (err) {
                debug(err.stack);
                return err.message;
            }
        },
        function (err) {
            debug(err.stack);
            return err.message;
        });
};

async function deleteRoute(tenantHost, appname) {
    getCFInfo(appname).then(
        async function (CFInfo) {
            try {
                // get route id
                let options = {
                    method: 'GET',
                    url: appEnv.app.cf_api + '/v3/apps/' + CFInfo.app_id + '/routes?hosts=' + tenantHost,
                    headers: {
                        'Authorization': 'Bearer ' + CFInfo.access_token
                    }
                };
                let res = await axios(options);
                if (res.data.pagination.total_results === 1) {
                    try {
                        // delete route
                        let options2 = {
                            method: 'DELETE',
                            url: appEnv.app.cf_api + '/v3/routes/' + res.data.resources[0].guid,
                            headers: {
                                'Authorization': 'Bearer ' + CFInfo.access_token
                            }
                        };
                        let res2 = await axios(options2);
                        console.log('Route deleted for ' + tenantHost);
                        return res2.data;
                    } catch (err) {
                        debug(err.stack);
                        return err.message;
                    }
                } else {
                    let errmsg = { 'error': 'Route not found' };
                    debug(errmsg);
                    return errmsg;
                }
            } catch (err) {
                debug(err.stack);
                return err.message;
            }
        },
        function (err) {
            debug(err.stack);
            return err.message;
        });
};

module.exports = (service) => {

    service.on('UPDATE', 'tenant', async (req, next) => {
        let tenantHost = req.data.subscribedSubdomain + '-' + appEnv.app.space_name.toLowerCase().replace(/_/g, '-') + '-' + services.registry.appName.toLowerCase().replace(/_/g, '-');
        let tenantURL = 'https:\/\/' + tenantHost + /\.(.*)/gm.exec(appEnv.app.application_uris[0])[0];
        console.log('Subscribe: ', req.data.subscribedSubdomain, req.data.subscribedTenantId, tenantHost);
        await next();
        createRoute(tenantHost, services.registry.appName).then(
            function (res2) {
                console.log('Subscribe: - Create Route: ', req.data.subscribedTenantId, tenantHost, tenantURL);
                return tenantURL;
            },
            function (err) {
                debug(err.stack);
                return '';
            });
        return tenantURL;
    });

    service.on('DELETE', 'tenant', async (req, next) => {
        let tenantHost = req.data.subscribedSubdomain + '-' + appEnv.app.space_name.toLowerCase().replace(/_/g, '-') + '-' + services.registry.appName.toLowerCase().replace(/_/g, '-');
        console.log('Unsubscribe: ', req.data.subscribedSubdomain, req.data.subscribedTenantId, tenantHost);
        await next();
        deleteRoute(tenantHost, services.registry.appName).then(
            async function (res2) {
                console.log('Unsubscribe: - Delete Route: ', req.data.subscribedTenantId);
                return req.data.subscribedTenantId;
            },
            function (err) {
                debug(err.stack);
                return '';
            });
        return req.data.subscribedTenantId;
    });

    service.on('dependencies', async (req) => {
        let dependencies = [{
            'xsappname': services.dest.xsappname
        }];
        console.log('Dependencies: ', dependencies);
        return dependencies;
    });

}