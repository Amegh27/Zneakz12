const User = require("../../models/userSchema")
const mongoose = require('mongoose')
const bcrypt = require('bcrypt')

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
        res.setHeader('Cache-Control', 'no-store');
        const { email, password } = req.body;
        const admin = await User.findOne({ email, isAdmin: true });

        if (admin) {
            const passwordMatch = bcrypt.compare(password, admin.password);
            if (passwordMatch) {
                req.session.admin = true;
                req.session.save(err => {
                    if (err) {
                        console.log("Session save error:", err);
                        return res.redirect('/pageError');
                    }
                    return res.redirect("/admin");
                });
            } else {
                return res.redirect("/admin/login"); 
            }
        } else {
            return res.redirect("/admin/login");
        }
    } catch (error) {
        console.log("Login error", error);
        return res.redirect('/pageError');
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


module.exports = {
    loadLogin,
    login,
    loadDashboard,
    pageError,
    logout
}