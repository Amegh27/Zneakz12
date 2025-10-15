const User = require("../models/userSchema");

async function forceLogoutIfBlocked(req, res, next) {
  try {
    if (req.session.adminId) return next();

    const userId = (req.user?._id || req.session?.user || '').toString();
    if (!userId) return next();

    const user = await User.findById(userId).lean();
    if (!user) {
      req.session.user = null;
      return res.redirect("/login");
    }

    if (user.isBlocked) {
      console.log(`Force logout: ${user.email} is blocked`);

      if (req.logout) {
        try {
          await new Promise((resolve) => req.logout(resolve));
        } catch (e) {
          console.warn("Logout error:", e);
        }
      }

      req.session.user = null;
      return res.redirect("/login?blocked=true");
    }

    next();
  } catch (err) {
    console.error("Force logout check failed:", err);
    next();
  }
}

module.exports = forceLogoutIfBlocked;
