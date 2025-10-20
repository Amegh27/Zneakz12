const User = require('../../models/userSchema')
const nodemailer = require('nodemailer')
const bcrypt = require('bcrypt')
const env = require('dotenv').config()
const session = require('express-session')


function generateOtp (){
    const digits ="1234567890"
    let otp = ""
    for(let i=0;i<6;i++){
        otp+=digits[Math.floor(Math.random()*10)]
    }
    return otp
}

const sendVerificationEmail = async(email,otp)=>{
    try {
        const transporter = nodemailer.createTransport({
            service:"gmail",
            port:587,
            secure:false,
            requireTLS:true,
            auth:{
                user:process.env.NODEMAILER_EMAIL,
                pass:process.env.NODEMAILER_PASSWORD,
            }
        })
        const mailOptions ={
            from:process.env.NODEMAILER_EMAIL,
            to:email,
            subject:"Your OTP for password reset",
            text:`Your OTP is ${otp}`,
            html:`<b><h4>Your OTP:${otp}</h4><br></br>`
        }

        const info = await transporter.sendMail(mailOptions)
        console.log('Email send:',info.messageId)
        return true



    } catch (error) {
        console.error("Error sending email",error)
        return false
    }
}

const securePassword = async(password)=>{
    try {
        const passwordHash = await bcrypt.hash(password,10)
        return passwordHash
    } catch (error) {
        
    }
}


const getForgotPassPage = async (req, res) => {
  try {
    res.render("forgot-password", { message: "", email: "" });
  } catch (error) {
    res.redirect("/pageNotFound");
  }
};


const forgotEmailValid = async(req,res)=>{
    try {
        const {email} = req.body
        const findUser = await User.findOne({email:email})
        if(!findUser){
         res.render('forgot-password',{message:"Email not found"})

        }
        if(findUser.googleId){
          res.render('forgot-password',{message:"Google user cant change password"})
        }
        if(findUser){
            const otp = generateOtp()
            const emailSend = await sendVerificationEmail(email,otp)
            if(emailSend){
                req.session.userOtp = otp
                req.session.email = email
                req.session.otpExpiry = Date.now() + 5 * 60 * 1000;
                res.render("forgotPass-otp")
                console.log("OTP",otp);
                
            }else{
                res.json({success:false,message:"Failed to send OTP. Please try again"})
            }

        }else{
            res.render("forgot-password",{
                message:"User with this email doesnot exist"
            })
        }
    } catch (error) {
        res.redirect('/pageNotFound')
    }
}

const verifyForgotPassOtp = async (req, res) => {
  try {
    const enteredOtp = String(req.body.otp || "");
    const storedOtp = String(req.session.userOtp || "");
    const expiry = req.session.otpExpiry;

    

    if (!storedOtp || !expiry) {
      return res.json({ success: false, message: "OTP session expired. Please request again." });
    }

    if (Date.now() > expiry) {
      req.session.userOtp = null;
      req.session.otpExpiry = null;
      return res.json({ success: false, message: "OTP has expired. Please request again." });
    }

  if(enteredOtp === storedOtp){
    req.session.userOtp = null;
    req.session.otpExpiry = null;
    return res.json({ success: true, redirectUrl: '/reset-password' });
}else{
    return res.json({ success: false, message: 'Invalid OTP' });
}

  } catch (error) {
    console.error("Error verifying OTP:", error);
    res.status(500).json({ success: false, message: "An error occurred. Please try again." });
  }
};


const getResetPassPage = async(req,res)=>{
    try {
        res.render('reset-password')

    } catch (error) {
        res.redirect('/pageNotFound')
    }
}


const resendOtp = async(req,res)=>{
  try {
    const otp = generateOtp();
    req.session.userOtp = otp;
    req.session.otpExpiry = Date.now() + 5 * 60 * 1000; 
    const email = req.session.email;

    const emailSend = await sendVerificationEmail(email, otp);
    if (emailSend) {
      console.log("Resend OTP:", otp);
      res.status(200).json({ success: true, message: "Resend OTP successful" });
    }
  } catch (error) {
    console.error("Error in resend OTP", error);
    res.status(500).json({ success: false, message: "Internal Server Error" });
  }
};


const postNewPassword = async (req, res) => {
  try {
    const { newPass1, newPass2 } = req.body;
    const email = req.session.email;

    if (newPass1 !== newPass2) {
      return res.render("reset-password", { message: "Passwords do not match" });
    }

    const user = await User.findOne({ email: email });
    if (!user) {
      return res.render("reset-password", { message: "User not found" });
    }

    const isSamePassword = await bcrypt.compare(newPass1, user.password);
    if (isSamePassword) {
      return res.render("reset-password", { message: "New password cannot be the same as old password" });
    }

    const passwordHash = await securePassword(newPass1);

    await User.updateOne(
      { email: email },
      { $set: { password: passwordHash } }
    );

    req.session.user = user._id;

    return res.redirect("/");
  } catch (error) {
    console.error("Error resetting password:", error);
    return res.redirect("/pageNotFound");
  }
};



const getProfilePage = async (req, res) => {
  try {
    const userId = req.session.user?._id; // Fixed: assume session.user is object with _id
    if (!userId) return res.redirect('/login');

    const user = await User.findById(userId).populate('wallet'); // Add .populate if wallet is ref
    res.render('profile', { user, message: null });
  } catch (error) {
    console.error('Error loading profile page:', error);
    res.redirect('/pageNotFound');
  }
};

const getEditProfilePage = async (req, res) => {
  try {
    const userId = req.session.user?._id; // Fixed
    const user = await User.findById(userId);

    if (!user) {
      return res.redirect('/login');
    }

    res.render('profile', { user });
  } catch (error) {
    console.error('Error loading edit profile page:', error);
    res.redirect('/pageNotFound');
  }
};

const postEditProfile = async (req, res) => {
  try {
    const userId = req.session.user?._id; // Fixed
    const { name, email, phone, gender, remove_avatar } = req.body; // Add remove_avatar

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    // Update text fields
    user.name = name || user.name;
    user.email = email || user.email;
    user.phone = phone || user.phone;
    user.gender = gender || user.gender;

    if (remove_avatar === '1') {
      if (user.avatar && user.avatar !== '/images/user-avatar.png') {
        const oldPicPath = path.join(__dirname, '../../public', user.avatar);
        fs.unlink(oldPicPath, (err) => {
          if (err) console.log('Old avatar not found (skip delete):', err.message);
        });
      }
      user.avatar = null;
    } else if (req.file) {
      if (user.avatar && user.avatar !== '/images/user-avatar.png') {
        const oldPicPath = path.join(__dirname, '../../public', user.avatar);
        fs.unlink(oldPicPath, (err) => {
          if (err) console.log('Old avatar not found (skip delete):', err.message);
        });
      }

      user.avatar = `/admin-assets/profile/${req.file.filename}`;
      console.log('Saved new avatar:', user.avatar); 
    }

    await user.save();
    console.log('User saved:', user); 

    res.json({ success: true, message: 'Profile updated successfully!' });
  } catch (error) {
    console.error('Error updating profile:', error);
    res.status(500).json({ success: false, message: 'Something went wrong while updating your profile.' });
  }
};

const getChangePasswordPage = async (req, res) => {
  try {
    const userId = req.session.user || req.user?._id;
    const user = await User.findById(userId);

    if (!user) {
      return res.redirect('/login');
    }

    res.render('change-password', { 
      message: null,
      googleUser: !!user.googleId 
    });
  } catch (error) {
    console.error('Error loading change password page:', error);
    res.redirect('/pageNotFound');
  }
};

const postChangePassword = async (req, res) => {
  try {
    const userId = req.session.user?._id || req.user?._id;
    const { currentPass, newPass1, newPass2 } = req.body;

    if (!userId) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    if (user.googleId) {
      return res.status(400).json({ success: false, message: 'Google users cannot change password here' });
    }

    const isCurrentValid = await bcrypt.compare(currentPass, user.password);
    if (!isCurrentValid) {
      return res.status(400).json({ success: false, message: 'Current password is incorrect' });
    }

    if (newPass1 !== newPass2) {
      return res.status(400).json({ success: false, message: 'New passwords do not match' });
    }

    const isSameAsCurrent = await bcrypt.compare(newPass1, user.password);
    if (isSameAsCurrent) {
      return res.status(400).json({ success: false, message: 'New password cannot be the same as current' });
    }

    const hashedPassword = await bcrypt.hash(newPass1, 10);
    user.password = hashedPassword;
    await user.save();

    res.json({ success: true, message: 'Password changed successfully!' });
  } catch (error) {
    console.error('Error changing password:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

const getAddressPage = async (req, res) => {
  try {
    const userId = req.session.user; 
    if (!userId) return res.redirect('/login');

    const user = await User.findById(userId);
    if (!user) return res.redirect('/login');

    res.render('address', { 
      user, 
      addresses: user.address || [] 
    });
  } catch (error) {
    console.error('Error loading address page:', error);
    res.redirect('/pageNotFound');
  }
};

const postAddAddress = async (req, res) => {
  try {
    const userId = req.session.user;
    if (!userId) return res.status(401).json({ success: false, message: 'Unauthorized access.' });

    const { name, city, state, pincode } = req.body;
    if (!name || !city || !state || !pincode)
      return res.status(400).json({ success: false, message: 'Please fill all required fields.' });

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ success: false, message: 'User not found.' });

    if (!Array.isArray(user.address)) user.address = [];

    if (user.address.length > 0) {
      user.address[0] = { name, city, state, pincode };
    } else {
      user.address.push({ name, city, state, pincode });
    }

    await user.save();

    return res.json({
      success: true,
      message: user.address.length > 1 ? 'Address updated successfully!' : 'Address saved successfully!'
    });
  } catch (error) {
    console.error('Error saving address:', error);
    return res.status(500).json({ success: false, message: 'Server error while saving address.' });
  }
};




module.exports = {
    getForgotPassPage,
    forgotEmailValid,
    verifyForgotPassOtp,
    getResetPassPage,
    resendOtp,
    postNewPassword,
    getProfilePage,
    getEditProfilePage,
    postEditProfile,
    getChangePasswordPage,
    postChangePassword,
    getAddressPage,
    postAddAddress
    
    

}