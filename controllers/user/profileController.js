const User = require('../../models/userSchema')
const nodemailer = require('nodemailer')
const bcrypt = require('bcrypt')
const env = require('dotenv').config()
const session = require('express-session')
const path = require('path');
const fs = require('fs');


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
        if (!findUser) {
      return res.render("forgot-password", {
        message: "Email not found",
        email
      });
    }
         if (findUser.googleId) {
      return res.render("forgot-password", {
        message: "Google users cannot change password via email",
        email
      });
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
    const userId = req.session.user?._id;
    if (!userId) return res.redirect('/login');

    const user = await User.findById(userId).populate('wallet').lean();
    res.render('profile', { user, message: null });
  } catch (error) {
    console.error('Error loading profile:', error);
    res.redirect('/pageNotFound');
  }
};

const getEditProfilePage = async (req, res) => {
  try {
    const userId = req.session.user?._id;
    const user = await User.findById(userId).lean();
    if (!user) return res.redirect('/login');
    res.render('profile', { user });
  } catch (error) {
    console.error('Error loading edit profile:', error);
    res.redirect('/pageNotFound');
  }
};

const postEditProfile = async (req, res) => {
  try {
    const userId = req.session.user?._id;
    const { name, email, phone, gender, remove_avatar } = req.body;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    user.name = name || user.name;
    user.phone = phone || user.phone;
    user.gender = gender || user.gender;

    if (email && email !== user.email) {

      if (!req.session.otpVerified || req.session.newEmail !== email) {
        return res.json({
          success: false,
          message: "Email not verified via OTP"
        });
      }

      user.email = email;

      req.session.otpVerified = false;
      req.session.emailChangeOtp = null;
      req.session.newEmail = null;
    }


    if (remove_avatar === '1') {
      if (user.avatar && user.avatar !== '/images/user-avatar.png') {
        const oldAvatarPath = path.join(__dirname, '../../public', user.avatar);
        fs.unlink(oldAvatarPath, err => {
          if (err) console.log('Old avatar deletion error:', err.message);
        });
      }
      user.avatar = null;
    }

  
    if (req.file) {
      if (user.avatar && user.avatar !== '/images/user-avatar.png') {
        const oldAvatarPath = path.join(__dirname, '../../public', user.avatar);
        fs.unlink(oldAvatarPath, err => {
          if (err) console.log('Old avatar deletion error:', err.message);
        });
      }

      user.avatar = `/admin-assets/profile/${req.file.filename}`;
    }

    await user.save();

    res.json({ success: true, message: 'Profile updated successfully!' });

  } catch (error) {
    console.error('Error updating profile:', error);
    res.status(500).json({ success: false, message: 'Something went wrong while updating your profile.' });
  }
};



const getEmailOtpPage = (req, res) => {
  const email = req.query.email;
  if (!email || !req.session.pendingProfile) {
    return res.redirect('/profile');
  }
  res.render('profile-otp', { email });
};


const verifyEmailOtp = async (req, res) => {
  try {
    const { otp } = req.body;
    const pending = req.session.pendingProfile;

    if (!pending || Date.now() > pending.otpExpiry || otp !== pending.otp) {
      req.session.pendingProfile = null;
      return res.json({ success: false, message: 'Invalid or expired OTP' });
    }

    const user = await User.findById(pending.userId || req.session.user?._id);
    if (!user) return res.json({ success: false, message: 'User not found' });

    const tempReq = {
      body: {
        name: pending.name,
        email: pending.email,
        phone: pending.phone,
        gender: pending.gender,
        remove_avatar: pending.remove_avatar
      },
      file: pending.avatarFile ? { filename: pending.avatarFile } : null
    };

    await saveProfile(user, tempReq);
    req.session.pendingProfile = null;

    res.json({ success: true });
  } catch (error) {
    console.error("OTP verify error:", error);
    res.json({ success: false, message: 'Server error' });
  }
};

const resendEmailOtp = async (req, res) => {
  try {
    const pending = req.session.pendingProfile;
    if (!pending) return res.json({ success: false });

    const newOtp = generateOtp();
    const emailSent = await sendVerificationEmail(pending.email, newOtp);

    if (emailSent) {
      pending.otp = newOtp;
      pending.otpExpiry = Date.now() + 5 * 60 * 1000;
      req.session.pendingProfile = pending;
      console.log("Resent OTP:", newOtp);
      res.json({ success: true });
    }
  } catch (error) {
    res.json({ success: false });
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
const sendEmailChangeOtp = async (req, res) => {
  try {
    const { newEmail } = req.body;

    const otp = Math.floor(100000 + Math.random() * 900000).toString();

    req.session.emailChangeOtp = otp;
    req.session.newEmail = newEmail;

    console.log("EMAIL CHANGE OTP:", otp);

    return res.json({ success: true });

  } catch (err) {
    console.error("Send OTP error:", err);
    return res.json({ success: false, message: "Failed to send OTP" });
  }
};

const verifyEmailChangeOtp = async (req, res) => {
  try {
    const { otp } = req.body;

    if (!req.session.emailChangeOtp) {
      return res.json({ success: false, message: "OTP expired" });
    }

    if (otp !== req.session.emailChangeOtp) {
      return res.json({ success: false, message: "Incorrect OTP" });
    }

    req.session.otpVerified = true;
    return res.json({ success: true });

  } catch (err) {
    console.error("Verify OTP error:", err);
    res.json({ success: false, message: "Server error" });
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

    const { name: address, city, state, pincode } = req.body;
    if (!address || !city || !state || !pincode)
      return res.status(400).json({ success: false, message: 'Please fill all required fields.' });

    if (address.length > 40) {
      return res.status(400).json({ success: false, message: 'Address must be 40 characters or less.' });
    }
    if (city.length > 40) {
      return res.status(400).json({ success: false, message: 'City must be 40 characters or less.' });
    }
    if (state.length > 40) {
      return res.status(400).json({ success: false, message: 'State must be 40 characters or less.' });
    }
    if (pincode.length !== 6 || !/^\d{6}$/.test(pincode)) {
      return res.status(400).json({ success: false, message: 'Pincode must be exactly 6 digits.' });
    }

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ success: false, message: 'User not found.' });

    if (!Array.isArray(user.address)) user.address = [];

    const exists = user.address.find(addr =>
      addr.name === address &&
      addr.city === city &&
      addr.state === state &&
      addr.pincode === pincode
    );

    if (exists) {
      return res.status(400).json({ success: false, message: 'This address already exists!' });
    }

    user.address.push({ name: address, city, state,phone, pincode });

    await user.save();

    return res.json({
      success: true,
      message: 'Address saved successfully!'
    });
  } catch (error) {
    console.error('Error saving address:', error);
    return res.status(500).json({ success: false, message: 'Server error while saving address.' });
  }
};

const postEditAddress = async (req, res) => {
  try {
    const userId = req.session.user;
    if (!userId) return res.status(401).json({ success: false, message: 'Unauthorized' });

    const { name, city, state, pincode } = req.body;

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

const addressId = req.body.addressId; 
const addr = user.address.id(addressId);
if (!addr) return res.status(404).json({ success: false, message: "Address not found" });

addr.name = req.body.name;
addr.city = req.body.city;
addr.state = req.body.state;
addr.pincode = req.body.pincode;

await user.save();

    addr.name = name;
    addr.city = city;
    addr.state = state;
    addr.pincode = pincode;

    await user.save();
    res.json({ success: true, message: 'Address updated successfully!' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

const deleteAddress = async (req, res) => {
  try {
    const userId = req.session.user;
    const addressId = req.params.id;

    if (!userId) {
      return res.status(401).json({ success: false, message: "Unauthorized access." });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found." });
    }

    const address = user.address.find(a => a._id.toString() === addressId);
    if (!address) {
      return res.status(404).json({ success: false, message: "Address not found." });
    }

    user.address = user.address.filter(a => a._id.toString() !== addressId);
    await user.save();

    return res.json({ success: true, message: "Address deleted successfully!" });
  } catch (error) {
    console.error("Error deleting address:", error);
    return res.status(500).json({ success: false, message: "Server error while deleting address." });
  }
};

const setDefaultAddress = async (req, res) => {
  try {
    const sess = req.session.user;
    const userId = typeof sess === "object" ? sess._id : sess;

    if (!userId) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const addressId = req.params.id;
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ success: false, message: "User not found" });

    const idx = user.address.findIndex(a => a._id.toString() === addressId);
    if (idx === -1) return res.status(404).json({ success: false, message: "Address not found" });

    const [addr] = user.address.splice(idx, 1);
    user.address.unshift(addr);
    await user.save();

    res.json({ success: true, message: "Default address updated!" });
  } catch (err) {
    console.error("setDefaultAddress error:", err);
    res.status(500).json({ success: false, message: "Server error" });
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
    sendEmailChangeOtp,
    verifyEmailChangeOtp,
    getAddressPage,
    postAddAddress,
    postEditAddress,
    deleteAddress,
    setDefaultAddress,
    getEmailOtpPage,
  verifyEmailOtp,
  resendEmailOtp
    
    

}