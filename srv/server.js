const cds = require('@sap/cds');



cds.on('bootstrap', app => {



    cds.mtx.in(app).then(async () => {
        const provisioning = await cds.connect.to('ProvisioningService');
        provisioning.impl(require('./provisioning'));
    });

});

module.exports = cds.server;