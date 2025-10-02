const express = require('express')
const router = express.Router()
const userController = require('../controllers/user/userController')
const passport = require('passport')
const { userAuth,adminAuth,checkUserBlocked } = require('../middlewares/auth')
const forceLogoutIfBlocked = require("../middlewares/blockCheck");
const productController = require('../controllers/user/productController')
const profileController = require('../controllers/user/profileController')
const cartController = require("../controllers/user/cartController");




router.get('/pageNotFound',userController.pageNotFound)
router.get('/',userController.loadHomepage)
router.get('/signup',userController.loadSignup)
router.post('/signup',userController.signup)
router.post("/verify-otp",userController.verifyOtp)
router.post('/resend-otp',userController.resendOtp)
router.get('/logout', userController.logout)


router.get('/auth/google',passport.authenticate('google',{scope:['profile','email']}))
router.get('/auth/google/callback',passport.authenticate('google',{failureRedirect: '/signup?blocked=true',}),(req,res)=>{
  req.session.user=req.user
    res.redirect('/')
})



router.get('/login',userController.loadLogin)
router.post('/login',userController.login)

router.use(forceLogoutIfBlocked);





// Profile Management
router.get('/forgot-password',profileController.getForgotPassPage)
router.post('/forgot-email-valid',profileController.forgotEmailValid)
router.post('/verify-passForgot-otp',profileController.verifyForgotPassOtp)
router.get('/reset-password',profileController.getResetPassPage)
router.post('/resend-forgot-otp',profileController.resendOtp)
router.post('/reset-password',profileController.postNewPassword)

// search
router.get('/search', productController.searchProducts);


// product management
router.get('/productDetails',userAuth,productController.productDetails)
router.get('/product-details', productController.productDetails);

// men section
router.get('/men', productController.getMenProducts);

// women section
router.get('/women', productController.getWomenProducts);


// kids section
router.get('/kids', productController.getKidsProducts);

// men details
router.get("/men-details", productController.menDetails);

// women details
router.get("/women-details", productController.womenDetails);

// kids details
router.get('/kids-details', productController.kidsDetails);

// cart management
router.get('/cart', cartController.viewCart);
router.get("/cart/load", cartController.loadCart);
router.post("/cart/add", cartController.addToCart);
router.post("/cart/update", cartController.updateCart);
router.post("/cart/remove", cartController.removeFromCart);

module.exports = router