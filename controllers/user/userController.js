
const User = require('../../models/userSchema')
const Category = require('../../models/categorySchema')
const Product = require('../../models/productSchema')
const env = require('dotenv').config()
const nodemailer = require('nodemailer')
const bcrypt = require('bcrypt')
const mongoose = require("mongoose");
const Cart = require("../../models/cartSchema");
const Offer = require('../../models/offerSchema');
const { applyBestOfferToProduct } = require('../../helpers/offerHelper');



const pageNotFound =  async(req,res)=>{
    try {
        res.render('page-404')
    } catch (error) {
        res.redirect('/pageNotFound')
    }
}
const loadHomepage = async (req, res) => {
  try {
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, private");

    const user = req.session.user;

    const page = parseInt(req.query.page) || 1;
    const limit = 4;

    const query = req.query.q?.trim() || "";
    const sort = req.query.sort || ""; 
    const priceRange = req.query.priceRange || "";

    const selectedCategory = Array.isArray(req.query.category)
      ? req.query.category
      : req.query.category
      ? [req.query.category]
      : [];

    let matchStage = {
      isBlocked: false,
      isListed: true,
      $or: [{ quantity: { $gt: 0 } }, { "sizes.stock": { $gt: 0 } }]
    };

    if (query) {
      matchStage.productName = { $regex: query, $options: "i" };
    }

    const excludeCats = await Category.find({
      name: { $in: ["Men", "Women", "Kids"] }
    }).distinct("_id");

    matchStage.category = { $nin: excludeCats };

    if (priceRange && priceRange.includes("-")) {
      const parts = priceRange.split("-");
      const min = Number(parts[0]);
      const max = Number(parts[1]);

      if (Number.isFinite(min) && Number.isFinite(max)) {
        matchStage.price = { $gte: min, $lte: max };
      }
    }

    if (selectedCategory.length > 0) {
      const selectedCatIds = await Category.find({
        name: { $in: selectedCategory }
      }).distinct("_id");

      matchStage.category = { $in: selectedCatIds };
    }


    let products = await Product.find(matchStage).lean();

    const now = new Date();
    const activeOffers = await Offer.find({
      startDate: { $lte: now },
      endDate: { $gte: now }
    });

    products = await Promise.all(
      products.map(async (product) => {
        const productOffers = activeOffers.filter(
          o =>
            o.offerType === "product" &&
            o.product?.toString() === product._id.toString()
        );

        const categoryOffers = activeOffers.filter(
          o =>
            o.offerType === "category" &&
            o.category?.toString() === product.category?.toString()
        );

        let bestOffer = null;
        let bestDiscount = 0;

        const calcDiscount = (offer) =>
          offer.discountType === "percentage"
            ? (product.price * offer.discountValue) / 100
            : offer.discountValue;

        for (const offer of [...productOffers, ...categoryOffers]) {
          const discountVal = calcDiscount(offer);
          if (discountVal > bestDiscount) {
            bestDiscount = discountVal;
            bestOffer = offer;
          }
        }

        let finalPrice =
          product.discountPrice && product.discountPrice < product.price
            ? product.discountPrice
            : product.price - bestDiscount;

        finalPrice = Math.max(finalPrice, 0);

        return {
          ...product,
          finalPrice,
          discountPercent: Math.round(((product.price - finalPrice) / product.price) * 100),
          appliedOffer: bestOffer
        };
      })
    );

    if (!sort || sort === "") {
      products.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    } else if (sort === "priceAsc") {
      products.sort((a, b) => a.finalPrice - b.finalPrice);
    } else if (sort === "priceDesc") {
      products.sort((a, b) => b.finalPrice - a.finalPrice);
    } else if (sort === "nameAsc") {
      products.sort((a, b) => a.productName.localeCompare(b.productName));
    } else if (sort === "nameDesc") {
      products.sort((a, b) => b.productName.localeCompare(a.productName));
    }

    const totalProducts = products.length;
    const totalPages = Math.ceil(totalProducts / limit);
    const paginatedProducts = products.slice((page - 1) * limit, page * limit);

    const categories = await Category.find({
      isListed: true,
      name: { $nin: ["Men", "Women", "Kids"] }
    });

    const userData = user ? await User.findById(user) : null;

    return res.render("home", {
      user: userData,
      products: paginatedProducts,
      currentPage: page,
      totalPages,
      query,
      sort,
      categories,
      selectedCategory,
      priceRange
    });
  } catch (err) {
    console.error("Homepage Error:", err);
    return res.status(500).send("Internal Server Error");
  }
};







const loadSignup = async (req, res) => {
    try {
        let message = '';
        if (req.query.blocked === 'true') {
            message = 'User is blocked by the admin';
        }
        return res.render('signup', { message });
    } catch (error) {
        console.log("Error loading signup page", error);
        res.status(500).send('Server Error');
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

const signup = async (req, res) => {
  try {
    const { name, email, password, cPassword, referralCode } = req.body;
    req.session.otpExpiry = Date.now() + 60 * 1000;

    if (password !== cPassword) {
      return res.render('signup', { message: "Passwords do not match" });
    }

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.render('signup', { message: "User with this email already exists" });
    }

    const otp = generateOtp();
    const sent = await sendVerificationEmail(email, otp);
    if (!sent) return res.json("email-error");

    req.session.userOtp = otp;
    req.session.UserData = { name, email, password, referralCode };

    res.render("verify-otp");
  } catch (error) {
    console.error("Signup error:", error);
    res.render("pageNotFound");
  }
};

const securePassword = async (password) => {
    try {
        const hashedPassword = await bcrypt.hash(password, 10);
        return hashedPassword;
    } catch (error) {
        console.error("Error hashing password", error);
        throw error;
    }
}
const verifyOtp = async (req, res) => {
  try {
    const { otp } = req.body;

    if (!req.session.otpExpiry || Date.now() > req.session.otpExpiry) {
      return res.status(400).json({
        success: false,
        message: "OTP has expired. Please request a new one.",
      });
    }

    if (otp !== req.session.userOtp) {
      return res.status(400).json({
        success: false,
        message: "OTP Expired"
      });
    }

    const user = req.session.UserData;

    const passwordHash = await securePassword(user.password);

    const saveUserData = new User({
      name: user.name,
      email: user.email,
      password: passwordHash,
    });

    saveUserData.referralCode =
      "ZNK" + Math.random().toString(36).substring(2, 8).toUpperCase();

    if (user.referralCode) {
      const referrer = await User.findOne({ referralCode: user.referralCode });
      if (referrer) {
        if (!referrer.wallet) referrer.wallet = { balance: 0, transactions: [] };

        referrer.wallet.balance += 100;

        referrer.wallet.transactions.push({
          type: "credit",
          amount: 100,
          description: `Referral bonus for inviting ${user.email}`,
          date: new Date(),
        });

        referrer.markModified("wallet");
        await referrer.save();

        saveUserData.referredBy = user.referralCode;
      }
    }

    await saveUserData.save();
    req.session.user = saveUserData._id;

    return res.json({ success: true, redirectUrl: "/" });

  } catch (error) {
    console.error("Error verifying OTP", error);
    return res.status(400).json({
      success: false,
      message: "An error occurred"
    });
  }
};



const resendOtp = async(req,res)=>{
    try {
        const {email} = req.session.UserData
        if(!email){
            return res.status(400).json({success:false,message:"Email not found in session"})
        }
        const otp = generateOtp()
        req.session.userOtp=otp
        req.session.otpExpiry = Date.now() + 60 * 1000; 
        const emailSend = await sendVerificationEmail(email,otp)
            if(emailSend){
                
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
      return res.render('login', { message: 'Please verify your email first.' });
    }

    if (findUser.isBlocked) {
      return res.render('login', { message: 'User is blocked by the admin' });
    }

    const passwordMatch = await bcrypt.compare(password, findUser.password);

    if (!passwordMatch) {
      return res.render('login', { message: 'Incorrect email or password' });
    }

    req.user = findUser;
    req.session.user = findUser._id.toString();

    req.session.loginSuccess = true;

    req.session.save((err) => {
      if (err) {
        console.error("Error saving session:", err);
        return res.render('login', { message: "Error creating session" });
      }
      return res.redirect('/');
    });

  } catch (error) {
    console.error("Login error", error);
    return res.render('login', { message: "Login failed, please try again" });
  }
};


const logout = async (req, res) => {
  try {
    if (req.logout) {
      await new Promise((resolve) => req.logout(resolve));
    }

    req.session.destroy((err) => {
      if (err) {
        console.error("Error destroying session:", err);
        return res.status(500).send("Logout failed");
      }

      res.clearCookie("connect.sid");
      res.redirect("/login");
    });
  } catch (error) {
    console.error("Logout error:", error);
    res.redirect("/login");
  }
};

const getReferPage = async (req, res) => {
  try {
    const userId = req.session.user;
    if (!userId) return res.redirect('/login');

    const user = await User.findById(userId);

    if (!user) return res.redirect('/login');

    const referralLink = `https://zneakz.com/signup?ref=${user.referralCode}`;

    res.render("refer", {
      user,
      referralLink
    });
  } catch (error) {
    console.error("Error loading referral page:", error);
    res.status(500).render("error", { message: "Error loading referral page" });
  }
};

  
const checkReferralCode = async (req, res) => {
  try {
    const { code } = req.params;

    if (!code || code.trim() === "") {
      return res.status(400).json({ valid: false, message: "Referral code required" });
    }

    const user = await User.findOne({ referralCode: code.trim() });

    if (user) {
      return res.json({ valid: true, message: "Referral code is valid" });
    } else {
      return res.json({ valid: false, message: "Invalid referral code" });
    }
  } catch (error) {
    console.error("Error checking referral code:", error);
    res.status(500).json({ valid: false, message: "Server error" });
  }
};

const getAboutPage = (req, res) => {
  try {
    const user = req.session.user || null;

    res.render("about", {
      user
    });
  } catch (error) {
    console.error(error);
    res.status(500).send("Server Error");
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
    getReferPage,
    checkReferralCode,
    getAboutPage
   
}