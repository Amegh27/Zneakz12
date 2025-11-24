const express = require('express')
const router = express.Router()
const userController = require('../controllers/user/userController')
const passport = require('passport')
const { userAuth,adminAuth,checkUserBlocked } = require('../middlewares/auth')
const forceLogoutIfBlocked = require("../middlewares/blockCheck");
const profileUpload = require('../middlewares/profileUpload');
const productController = require('../controllers/user/productController')
const profileController = require('../controllers/user/profileController')
const cartController = require("../controllers/user/cartController");
const checkoutController = require("../controllers/user/checkoutController");
const { downloadInvoice } = require("../controllers/user/checkoutController");
const uploads = require('../middlewares/multerConfig')
const wishlistController = require('../controllers/user/wishlistController')

router.use(forceLogoutIfBlocked);

router.get('/pageNotFound',userController.pageNotFound)
router.get('/',userController.loadHomepage)
router.get('/signup',userController.loadSignup)
router.post('/signup',userController.signup)
router.post("/verify-otp",userController.verifyOtp)
router.post('/resend-otp',userController.resendOtp)
router.get('/logout', userController.logout)


router.get('/auth/google',passport.authenticate('google',{scope:['profile','email']}))
router.get('/auth/google/callback', passport.authenticate('google', { failureRedirect: '/login?error=true' }), (req, res) => {  
  req.session.user = req.user._id.toString(); 
  res.redirect('/');
});



router.get('/login',userController.loadLogin)
router.post('/login',userController.login)

router.get('/about',userController.getAboutPage)







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



// Profile management

router.get('/profile', userAuth, profileController.getProfilePage);
router.get('/profile/edit', userAuth, profileController.getEditProfilePage); 
router.post('/profile/edit', userAuth, profileUpload.single('avatar'), profileController.postEditProfile); 
router.get('/profile/verify-email-otp', profileController.getEmailOtpPage);
router.post('/profile/verify-email-otp', profileController.verifyEmailOtp);
router.post('/profile/resend-email-otp', profileController.resendEmailOtp);
router.get('/change-password', userAuth, profileController.getChangePasswordPage);
router.post('/change-password', userAuth, profileController.postChangePassword);
router.post('/profile/send-otp', userAuth, profileController.sendEmailChangeOtp);
router.post('/profile/verify-otp', userAuth, profileController.verifyEmailChangeOtp);
router.get('/address', profileController.getAddressPage);
router.post('/address', profileController.postAddAddress);
router.put('/address/edit/:id', profileController.postEditAddress);
router.delete('/address/delete/:id', profileController.deleteAddress);
router.put('/address/set-default/:id', profileController.setDefaultAddress);

// cart management
router.get('/cart', cartController.viewCart);
router.get("/cart/load", cartController.loadCart);
router.post("/cart/add", cartController.addToCart);
router.post("/cart/update", cartController.updateCart);
router.post("/cart/remove", cartController.removeFromCart);
router.get('/cart/count',cartController.cartCount)


router.get("/checkout", checkoutController.checkoutPage);
router.post("/checkout/place-order", checkoutController.placeOrder);
router.get('/order-success',checkoutController.orderSuccessPage);

router.get("/orders", checkoutController.getUserOrders);
router.get("/orders/:id", checkoutController.getUserOrders);
router.get("/orders/details/:id", checkoutController.viewOrderDetails);
router.post("/orders/:id/cancel", checkoutController.cancelOrder);
router.post("/orders/:orderId/items/:itemId/cancel", checkoutController.cancelItem);
router.get("/orders/:orderId/items/:itemId/return", checkoutController.returnItemPage);
router.post("/orders/:orderId/items/:itemId/return", checkoutController.submitReturnItem);
router.get("/orders/:id", checkoutController.getUserOrders);


router.get("/orders/:id/invoice", checkoutController.downloadInvoice);
  

// wishlist management

router.get('/wishlist', wishlistController.getWishlistPage);
router.post("/wishlist/add/:productId", wishlistController.addToWishlist);
router.delete("/wishlist/remove/:productId", wishlistController.removeFromWishlist);
router.post("/wishlist/move-to-cart/:productId", wishlistController.moveToCart);


// coupon management
router.get('/checkout/available-coupons', checkoutController.availableCoupons);
router.post('/checkout/apply-coupon', checkoutController.applyCoupon);
router.delete('/checkout/remove-coupon', checkoutController.removeCoupon);


// razorpay
router.post("/create-razorpay-order", checkoutController.createRazorpayOrder);
router.post("/verify-payment", checkoutController.verifyRazorpayPayment);
router.get("/order-failure", checkoutController.orderFailurePage);

// wallet
router.get("/wallet", checkoutController.getWalletPage);
router.post("/checkout/pay-wallet", checkoutController.payWithWallet);
router.get("/balance", checkoutController.getWalletBalance);


// refer
router.get("/refer", userController.getReferPage);
router.get("/check-referral/:code", userController.checkReferralCode);


module.exports = router