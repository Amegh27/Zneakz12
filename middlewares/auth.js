
const User = require("../models/userSchema");

const userAuth = async (req, res, next) => {
  try {
    const userId = req.session.user;

    if (!userId) {
      return res.redirect('/login');
    }

    const user = await User.findById(userId);

    if (!user || user.isBlocked) {
      req.session.destroy((err) => {
        if (err) console.error("Error destroying session:", err);
        res.clearCookie('connect.sid');
        return res.redirect('/login?blocked=1');
      });
    } else {
      req.session.user = user._id;
      req.user = user;
      next();
    }
  } catch (error) {
    console.error("Error in userAuth middleware:", error);
    res.status(500).send("Internal Server Error");
  }
};



const adminAuth = (req,res,next)=>{
    User.findOne({isAdmin:true})
    .then(data=>{
        if(data){
            next()
        }else{
            res.redirect('/admin/login')
        }
    })
    .catch(error=>{
        console.log("Error in adminauth middleware",error)
        res.status(500).send("Internal server error")
    })
}





module.exports ={
    userAuth,
    adminAuth,
    
}