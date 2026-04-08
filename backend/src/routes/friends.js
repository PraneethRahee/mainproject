const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const friendController = require('../controllers/friendController');

router.use(requireAuth);

router.post('/request', friendController.sendRequest);
router.post('/accept', friendController.acceptRequest);
router.post('/reject', friendController.rejectRequest);
router.get('/list', friendController.listFriends);
router.get('/requests/pending', friendController.listPendingRequests);
router.get('/requests/sent', friendController.listSentRequests);

module.exports = router;
