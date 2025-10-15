const User = require("../../models/userSchema")
const mongoose = require('mongoose')
const bcrypt = require("bcrypt");




const pageError = async(req,res)=>{
    res.render("error")
}

const loadLogin = (req,res)=>{
    if(req.session.admin){
        return res.redirect("/admin")
    }
    res.render('admin-login',{message:null})
}


const login = async (req, res) => {
  try {
    res.setHeader("Cache-Control", "no-store");
    const { email, password } = req.body;
    const admin = await User.findOne({ email, isAdmin: true });

    if (!admin) {
      return res.status(401).json({ message: "Invalid email or password" });
    }

    const passwordMatch = await bcrypt.compare(password, admin.password);
    if (!passwordMatch) {
      return res.status(401).json({ message: "Invalid email or password" });
    }

    req.session.admin = true;
    req.session.adminId = admin._id.toString();

    req.session.save((err) => {
      if (err) {
        console.error("Session save error:", err);
        return res.status(500).json({ message: "Server error" });
      }
      return res.status(200).json({ message: "Login successful" });
    });

  } catch (error) {
    console.error("Login error", error);
    return res.status(500).json({ message: "Server error" });
  }
};





const loadDashboard = async(req,res)=>{
    if(req.session.admin){
       
        try {
            res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
            res.render('dashboard')
        } catch (error) {
            res.redirect('/pageError')
        }
    }else {
        return res.redirect('/admin/login')
    }
}

const logout = async (req, res) => {
  try {
    req.session.destroy((err) => {
      if (err) {
        console.log("Session destruction error:", err);
        return res.redirect('/pageError');
      }

      res.clearCookie('connect.sid'); 
      res.redirect('/admin/login');
    });
  } catch (error) {
    console.log("Unexpected error during logout", error);
    res.redirect('/pageError');
  }
};

const blockUser = async (req, res) => {
  try {
    const userId = req.params.id;
    if (userId === req.session.adminId) {
      req.flash('error', 'Cannot block yourself');
      return res.redirect('/admin/users');
    }
    const user = await User.findByIdAndUpdate(userId, { isBlocked: true }, { new: true });
    if (!user) {
      req.flash('error', 'User not found');
      return res.redirect('/admin/users');
    }
    const store = req.app.get('sessionStore');
    await destroyUserSessions(userId, store);
    req.flash('success', 'User blocked and all sessions terminated');
    res.redirect('/admin/users');
  } catch (error) {
    console.error('Block user error:', error);
    req.flash('error', 'Failed to block user');
    res.redirect('/admin/users');
  }
};



module.exports = {
    loadLogin,
    login,
    loadDashboard,
    pageError,
    logout,
    blockUser
}