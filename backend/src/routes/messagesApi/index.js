const express = require('express');
const { requireAuth } = require('../../middleware/auth');

const router = express.Router();
router.use(requireAuth);

require('./registerSearch')(router);
require('./registerPinStar')(router);
require('./registerPostMessage')(router);
require('./registerDeliveryRead')(router);
require('./registerPatchDelete')(router);
require('./registerListAndMedia')(router);

module.exports = router;
