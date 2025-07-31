const express = require('express')
const router = express.Router()
const userController = require('../controllers/user/userController')
const passport = require('passport')
const { userAuth,adminAuth,checkUserBlocked } = require('../middlewares/auth')
const productController = require('../controllers/user/productController')
const profileController = require('../controllers/user/profileController')



router.get('/pageNotFound',userController.pageNotFound)
router.get('/',userController.loadHomepage)
router.get('/signup',userController.loadSignup)
router.post('/signup',userController.signup)
router.post("/verify-otp",userController.verifyOtp)
router.post('/resend-otp',userController.resendOtp)
router.get('/logout', userController.logout)


router.get('/auth/google',passport.authenticate('google',{scope:['profile','email']}))
router.get('/auth/google/callback',passport.authenticate('google',{failureRedirect:'/signup'}),(req,res)=>{
  req.session.user=req.user
    res.redirect('/')
})


router.get('/login',userController.loadLogin)
router.post('/login',userController.login)






// Profile Management
router.get('/forgot-password',profileController.getForgotPassPage)
router.post('/forgot-email-valid',profileController.forgotEmailValid)
router.get('/forgot-email-valid', (req, res) => {
  res.redirect('/reset-password');
});
router.post('/verify-passForgot-otp',profileController.verifyForgotPassOtp)
router.get('/reset-password',profileController.getResetPassPage)
router.post('/resend-forgot-otp',profileController.resendOtp)
router.post('/reset-password',profileController.postNewPassword)

// search
router.get('/search', productController.searchProducts);


// product management
router.get('/productDetails',userAuth,productController.productDetails)
router.get('/product-details', productController.productDetails);


module.exports = router