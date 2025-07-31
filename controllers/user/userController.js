
const User = require('../../models/userSchema')
const Category = require('../../models/categorySchema')
const Product = require('../../models/productSchema')
const env = require('dotenv').config()
const nodemailer = require('nodemailer')
const bcrypt = require('bcrypt')
const mongoose = require("mongoose");

const pageNotFound =  async(req,res)=>{
    try {
        res.render('page-404')
    } catch (error) {
        res.redirect('/pageNotFound')
    }
}

const loadHomepage = async (req, res) => {
  try {
    const user = req.session.user;
    const page = parseInt(req.query.page) || 1;
    const limit = 4;
    const skip = (page - 1) * limit;

    const query = req.query.q?.trim() || '';
    const sort = req.query.sort || '';
    const selectedCategory = Array.isArray(req.query.category)
      ? req.query.category
      : req.query.category
      ? [req.query.category]
      : [];
    const selectedPriceRange = req.query.priceRange || '';

    
    let filter = {
      isBlocked: false,
      quantity: { $gt: 0 }
    };

   
    if (query) {
      filter.productName = { $regex: query, $options: 'i' };
    }

    
   

if (selectedCategory.length > 0) {
  const categoryDocs = await Category.find({
    name: { $in: selectedCategory }
  }).distinct('_id')

  const categoryIds = categoryDocs.map(cat => cat._id);
  filter.category = { $in: categoryIds };
}


   
    if (selectedPriceRange) {
      const [min, max] = selectedPriceRange.split('-').map(Number);
      filter.price = { $gte: min, $lte: max };
    }

    
    let sortOption = {};
    if (sort === 'priceAsc') sortOption.price = 1;
    else if (sort === 'priceDesc') sortOption.price = -1;
    else if (sort === 'nameAsc') sortOption.productName = 1;
    else if (sort === 'nameDesc') sortOption.productName = -1;

    const totalProducts = await Product.countDocuments(filter);
    const totalPages = Math.ceil(totalProducts / limit);

    const products = await Product.find(filter)
      .sort(sortOption)
      .skip(skip)
      .limit(limit);

    const categories = await Category.find({ isListed: true });
    const userData = user ? await User.findById(user) : null;
   




     res.render("home", {
  user: userData,
  products:products,
  currentPage: page,
  totalPages,
  query,
  sort,
  categories,  
  selectedCategory: req.query.category || '',
priceRange: req.query.priceRange || ''

});

  } catch (err) {
    console.error("Error loading homepage:", err);
    res.status(500).send("Internal Server Error");
  }
};




const loadSignup = async(req,res)=>{
    try {
        return res.render('signup')
    } catch (error) {
        console.log("Error loading home page",error);
        res.status(500).send('Server Error')
        
        
    }
}
const generateOtp=()=>{
    return Math.floor(100000+Math.random()*900000).toString()
}
async function sendVerificationEmail(email,otp){
    try {
        console.log(`OTP for ${email}: ${otp}`);
        const transporter = nodemailer.createTransport({
            service:'gmail',
            port:587,
            secure:false,
            requireTLS:true,
            auth:{
                user:process.env.NODEMAILER_EMAIL,
                pass:process.env.NODEMAILER_PASSWORD
            }
        })
        const info =await transporter.sendMail({
            from:process.env.NODEMAILER_EMAIL,
            to:email,
            subject:"Verify your account",
            text:`Your OTP id ${otp}`,
            html:`<b>Your OTP : ${otp} </b>`
        })
        return info.accepted.length >0



    } catch (error) {
        console.error("Error sending email",error);
        return false
        
    }
}

const signup = async(req,res)=>{
    try {
        const {name,email,password,cPassword} = req.body
        if(password!==cPassword){
            return res.render('signup',{message:"Password do not match"})
        }
        const findUser = await User.findOne({email})
        if(findUser){
            return res.render('signup',{message:"User with this email already exists"})
        }
        const otp = generateOtp()
        const sendEmail = await sendVerificationEmail(email,otp)
        if(!sendEmail){
            return res.json("email-error")
        }
        req.session.userOtp = otp
        req.session.UserData = {name,email,password}

        res.render("verify-otp")
        // console.log("OTP send",otp);

    } catch (error) {
        console.error("sigup error",error)
        res.render('/pageNotFound')
    }
}
const securePassword = async (password) => {
    try {
        const hashedPassword = await bcrypt.hash(password, 10);
        return hashedPassword;
    } catch (error) {
        console.error("Error hashing password", error);
        throw error;
    }
}
const verifyOtp = async(req,res)=>{
    try {
        const { otp } = req.body;

        if (otp === req.session.userOtp) {
            const user  = req.session.UserData;

            if (!user || !user.password) {
                return res.status(400).json({ success: false, message: "User data is missing or invalid" });
            }

            const passwordHash = await securePassword(user.password);

            const saveUserData = new User({
                name: user.name,
                email: user.email,
                password: passwordHash
            });

            await saveUserData.save();

            req.session.user = saveUserData._id;
            res.json({ success: true, redirectUrl: "/" });

        } else {
            res.status(400).json({ success: false, message: "Invalid OTP, please try again" });
        }
    } catch (error) {
        console.error("Error verifying OTP", error);
        res.status(400).json({ success: false, message: "An error occurred" });
    }
}

const resendOtp = async(req,res)=>{
    try {
        const {email} = req.session.UserData
        if(!email){
            return res.status(400).json({success:false,message:"Email not found in session"})
        }
        const otp = generateOtp()
        req.session.userOtp=otp
        const emailSend = await sendVerificationEmail(email,otp)
            if(emailSend){
                // console.log("Resend OTP: ",otp);
                res.status(200).json({success:true,message:"OTP send succesffully"})
            }else{
                res.status(500).json({success:false,message:"Failed to resend OTP,please try again"})
            }
        
    } catch (error) {
        console.error("Error sending OTP",error)
        res.status(500).json({success:false,message:"Internal server error,please try again"})
    }
}


const loadLogin = async(req,res)=>{
    try {
        if(!req.session.user){
            res.setHeader('Cache-Control', 'no-store');
            return res.render('login')
        }else{
            res.redirect('/')
        }
    } catch (error) {
        res.redirect('Page not found')
    }
}

const login = async (req, res) => {
    try {
        const { email, password } = req.body;

        const findUser = await User.findOne({ isAdmin: 0, email });

        if (!findUser) {
            return res.render('login', { message: 'User not found' });
        }

        if (!findUser.password) {
            return res.render('login', { message: 'User has no password. Please verify your email via OTP first.' });
        }

        if (findUser.isBlocked) {
            return res.render("login", { message: "User is blocked by the admin" });
        }

        const passwordMatch = await bcrypt.compare(password, findUser.password);

        if (!passwordMatch) {
            return res.render('login', { message: "Incorrect password" });
        }

        req.session.user = findUser._id;
        return res.redirect('/');

    } catch (error) {
        console.error("Login error", error);
        return res.render('login', { message: "Login failed, please try again" });
    }
}
const logout = async (req, res) => {
  try {
    const redirectTo = req.query.blocked === '1' ? '/login?blocked=1' : (req.get("referer") || "/login");

    req.session.destroy((err) => {
      if (err) {
        console.error("Error destroying session:", err);
        return res.status(500).send("Unable to log out. Please try again.");
      }

      res.clearCookie("connect.sid");
      res.redirect(redirectTo);
    });
  } catch (error) {
    console.error("Logout error:", error);
    res.status(500).send("Server error during logout");
  }
};











module.exports ={
    loadHomepage,
    pageNotFound,
    loadSignup,
    signup,
    verifyOtp,
    resendOtp,
    loadLogin,
    login,
    logout,
   
}