const User = require("../models/userSchema");

async function forceLogoutIfBlocked(req, res, next) {
  try {
    
    if (req.session.adminId) return next();

    
    let userId = req.user?._id?.toString() || req.session.user;

    if (userId) {
      const user = await User.findById(userId).lean();

      if (user?.isBlocked) {
        try {
          if (req.logout) await req.logout(); 
        } catch (e) {
          console.warn("Logout failed:", e);
        }

        req.session.destroy(() => {
          res.clearCookie("connect.sid");
          return res.redirect("/login?blocked=true");
        });
        return; 
      }
    }

    next();
  } catch (err) {
    console.error("Force logout check failed:", err);
    return res.status(500).send("Server error");
  }
}

module.exports = forceLogoutIfBlocked;
