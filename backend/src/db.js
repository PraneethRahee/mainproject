const mongoose = require('mongoose');
const { config } = require('./config');

async function connectMongo() {
  if (mongoose.connection.readyState === 1) {
    return mongoose.connection;
  }

  try {
    await mongoose.connect(config.mongodbUri, {
      // Use modern defaults; mongoose handles options internally.
    });

    console.log('Connected to MongoDB');
    return mongoose.connection;
  } catch (err) {
    console.error('Failed to connect to MongoDB', err);
    process.exit(1);
  }
}

module.exports = {
  connectMongo,
};

