const express = require('express')
const router = express.Router()
const adminController = require("../controllers/admin/adminController")
const customerController = require('../controllers/admin/customerController')
const categoryController = require('../controllers/admin/categoryController')
const {userAuth,adminAuth} = require('../middlewares/auth')
const uploads = require('../middlewares/multerConfig')
const productController = require('../controllers/admin/productController')
const orderController = require('../controllers/admin/orderController')
const offerController = require('../controllers/admin/offerController')


router.get('/pageError',adminController.pageError)
// Login management
router.get("/admin-login",adminController.loadLogin)
router.get("/login", adminController.loadLogin);

router.post('/login',adminController.login)
router.get('/',adminAuth,adminController.loadDashboard)
router.get('/logout',adminController.logout)

// Customer management
router.get('/users',adminAuth,customerController.customerInfo)
router.get('/blockCustomer',adminAuth,customerController.customerBlocked)
router.get('/unblockCustomer',adminAuth,customerController.customerunBlocked)

// category management
router.get('/category',adminAuth,categoryController.categoryInfo)
router.post('/addCategory',adminAuth,categoryController.addCategory)
router.get('/listCategory',adminAuth,categoryController.getListCategory)
router.get('/unlistCategory',adminAuth,categoryController.getUnlistCategory)
router.get('/edit-category/:id',adminAuth,categoryController.getEditCategory)
router.post('/edit-category/:id',adminAuth,categoryController.editCategory)

// product management
router.get('/product-add',adminAuth,productController.getProductAddpage)
router.post('/product-add',adminAuth,uploads.array('images',4),productController.addProducts)
router.get('/products',adminAuth,productController.getAllProducts)
router.get('/blockProduct',adminAuth,productController.blockProduct)
router.get('/unblockProduct',adminAuth,productController.unblockProduct)
router.get('/editproduct',adminAuth,productController.getEditProduct)
router.post('/editProduct/:id',adminAuth,uploads.array('images',4),productController.editProduct)
router.post('/deleteImage',adminAuth,productController.deleteSingleImage)
router.get('/products/delete/:id', adminAuth, productController.softDeleteProduct);

// order management
router.get("/orders", orderController.getAllOrders);
router.post("/orders/:orderId/items/:itemId/status", orderController.updateItemStatus);

// return management
router.get('/return', orderController.viewReturns); 
router.get('/return/:id', orderController.viewReturnDetails);
router.post('/returns/:orderId/:itemId/approve', orderController.approveReturn);
router.post('/returns/:orderId/:itemId/reject', orderController.rejectReturn);


// offer management
// Product Offer Routes
router.post('/product-offer', offerController.createProductOffer);
router.delete('/remove-product-offer/:productId', offerController.removeProductOffer);

// Category Offer Routes
router.post('/category-offer', offerController.createCategoryOffer);
router.delete('/remove-category-offer/:offerId', offerController.removeOffer);


module.exports = router