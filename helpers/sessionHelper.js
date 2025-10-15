const mongoose = require('mongoose');

async function destroyUserSessions(userId, store) {
  const SessionSchema = new mongoose.Schema({}, { strict: false });

  const Session = mongoose.models.Session || mongoose.model('Session', SessionSchema, 'sessions');

  const result = await Session.deleteMany({
    session: { $regex: `"user":"${userId}"` }
  });

  return result.deletedCount;
}

module.exports = { destroyUserSessions };
