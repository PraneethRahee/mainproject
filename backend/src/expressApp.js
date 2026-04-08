const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const { config } = require('./config');
const authRoutes = require('./auth/authRoutes');
const adminRoutes = require('./routes/adminRoutes');
const userRoutes = require('./routes/userRoutes');
const channelRoutes = require('./routes/channelRoutes');
const conversationRoutes = require('./routes/conversationRoutes');
const e2eRoutes = require('./routes/e2eRoutes');
const messageRoutes = require('./routes/messageRoutes');
const messagesApiRoutes = require('./routes/messagesApiRoutes');
const groupMessageRoutes = require('./routes/groupMessageRoutes');
const groupRoutes = require('./routes/groupRoutes');
const fileRoutes = require('./routes/fileRoutes');
const abuseRoutes = require('./routes/abuseRoutes');
const chatLockRoutes = require('./routes/chatLockRoutes');
const notificationRoutes = require('./routes/notificationRoutes');
const storyRoutes = require('./routes/storyRoutes');
const callRoutes = require('./routes/callRoutes');
const friendRoutes = require('./routes/friends');

const featurePushNotificationsEnabled = Boolean(config.featurePushNotificationsEnabled);
const featureCallsEnabled = Boolean(config.featureCallsEnabled);
const featureStoriesEnabled = Boolean(config.featureStoriesEnabled);

const app = express();

app.use(
  helmet({
    contentSecurityPolicy: false,
  }),
);

app.use(
  cors({
    origin: true,
    credentials: true,
  }),
);

app.use(
  express.json({
    limit: '1mb',
  }),
);

app.get('/health', (_req, res) => {
  res.status(200).json({ status: 'ok' });
});

app.use('/auth', authRoutes);
app.use('/users', userRoutes);
app.use('/channels', channelRoutes);
app.use('/conversations', conversationRoutes);
app.use('/friends', friendRoutes);
app.use('/e2e', e2eRoutes);
app.use('/files', fileRoutes);
app.use('/abuse', abuseRoutes);
app.use('/chat-lock', chatLockRoutes);
app.use('/', messagesApiRoutes);
app.use('/', groupMessageRoutes);
app.use('/', groupRoutes);
app.use('/', messageRoutes);
if (featurePushNotificationsEnabled) app.use('/', notificationRoutes);
if (featureStoriesEnabled) app.use('/', storyRoutes);
if (featureCallsEnabled) app.use('/', callRoutes);
app.use('/admin', adminRoutes);

module.exports = {
  app,
  featurePushNotificationsEnabled,
  featureStoriesEnabled,
  featureCallsEnabled,
};
