
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
    const skip = (page - 1) * limit;
    const query = req.query.q?.trim() || '';
    const sort = req.query.sort || '';
    const selectedCategory = Array.isArray(req.query.category)
      ? req.query.category
      : req.query.category
      ? [req.query.category]
      : [];
    const selectedPriceRange = req.query.priceRange || '';

    // Base filters
    let matchStage = {
      isBlocked: false,
      isListed: true,
      $or: [{ quantity: { $gt: 0 } }, { "sizes.stock": { $gt: 0 } }]
    };

    if (query) matchStage.productName = { $regex: query, $options: 'i' };

    // Exclude base categories
    const excludeCategories = await Category.find({
      name: { $in: ["Men", "Women", "Kids"] }
    }).distinct("_id");
    matchStage.category = { $nin: excludeCategories };

    if (selectedCategory.length > 0) {
      const categoryDocs = await Category.find({
        name: { $in: selectedCategory }
      }).distinct('_id');
      matchStage.category = { $in: categoryDocs };
    }

    // Pagination pipeline
    let pipeline = [
      { $match: matchStage },
      { $sort: sort === 'priceAsc' ? { price: 1 } :
                sort === 'priceDesc' ? { price: -1 } :
                sort === 'nameAsc' ? { productName: 1 } :
                sort === 'nameDesc' ? { productName: -1 } :
                { createdAt: -1 }},
      { $skip: skip },
      { $limit: limit }
    ];

    let products = await Product.aggregate(pipeline);

    // Fetch active offers
    const now = new Date();
    const activeOffers = await Offer.find({
      startDate: { $lte: now },
      endDate: { $gte: now }
    });

    // 🧠 Apply best offer or discount logic
    products = await Promise.all(products.map(async (product) => {
      const productOffers = activeOffers.filter(o =>
        o.offerType === 'product' && o.product?.toString() === product._id.toString()
      );

      const categoryOffers = activeOffers.filter(o =>
        o.offerType === 'category' && o.category?.toString() === product.category?.toString()
      );

      let bestOffer = null;
      let bestDiscountValue = 0;

      const calcDiscount = (offer) => {
        return offer.discountType === 'percentage'
          ? (product.price * offer.discountValue) / 100
          : offer.discountValue;
      };

      for (const offer of [...productOffers, ...categoryOffers]) {
        const discountVal = calcDiscount(offer);
        if (discountVal > bestDiscountValue) {
          bestDiscountValue = discountVal;
          bestOffer = offer;
        }
      }

      if (!bestOffer && product.discountPrice && product.discountPrice < product.price) {
        const discountVal = product.price - product.discountPrice;
        const discountPercent = Math.round((discountVal / product.price) * 100);

        return {
          ...product,
          finalPrice: Number(product.discountPrice.toFixed(1)),
          discountPercent,
          appliedOffer: null
        };
      }

      // If offer found
      if (bestOffer) {
        const discountPercent =
          bestOffer.discountType === 'percentage'
            ? bestOffer.discountValue
            : Math.round((bestDiscountValue / product.price) * 100);

        return {
          ...product,
          finalPrice: Number(Math.max(product.price - bestDiscountValue, 0).toFixed(1)),
          discountPercent,
          appliedOffer: {
            title: bestOffer.title,
            offerType: bestOffer.offerType,
            discountType: bestOffer.discountType,
            discountValue: bestOffer.discountValue,
            startDate: bestOffer.startDate,
            endDate: bestOffer.endDate
          }
        };
      }

      // No offer or discount
      return { ...product, finalPrice: product.price, discountPercent: 0, appliedOffer: null };
    }));

    // Count for pagination
    const countResult = await Product.countDocuments(matchStage);
    const totalPages = Math.ceil(countResult / limit);

    const categories = await Category.find({
      isListed: true,
      name: { $nin: ["Men", "Women", "Kids"] }
    });

    const userData = user ? await User.findById(user) : null;

    res.render("home", {
      user: userData,
      products,
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