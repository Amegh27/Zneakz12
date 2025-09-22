
const destroyUserSessions = async (userId, store) => {
  return new Promise((resolve, reject) => {
    store.all((err, sessions) => {
      if (err) {
        console.error("Error fetching sessions:", err);
        return reject(err);
      }

      console.log(`Total sessions found: ${sessions?.length || 0}`);

      const targetSessions = sessions
        .filter((sess) => {
          try {
            const sessionData = JSON.parse(sess.session);
            const isUserSession =
              sessionData.user &&
              sessionData.user.toString() === userId.toString() &&
              !sessionData.adminId;
            if (isUserSession) {
              console.log(`Targeting session ${sess.id} for user ${userId}`);
            }
            return isUserSession;
          } catch (parseErr) {
            console.error(`Session parse error for ${sess.id}:`, parseErr);
            return false;
          }
        })
        .map((sess) => sess.id);

      console.log(`Target sessions to destroy: ${targetSessions.length}`);

      if (targetSessions.length === 0) return resolve();

      let destroyedCount = 0;
      targetSessions.forEach((sid) => {
        store.destroy(sid, (err) => {
          if (err) console.error(`Error destroying session ${sid}:`, err);
          destroyedCount++;
          if (destroyedCount === targetSessions.length) resolve();
        });
      });
    });
  });
};

module.exports = { destroyUserSessions };
