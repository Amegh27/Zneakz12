const Product = require('../../models/productSchema')
const Category = require('../../models/categorySchema')
const User = require('../../models/userSchema')


const searchProducts = async (req, res) => {
  try {
    const query = req.query.q?.trim() || '';
    const page = parseInt(req.query.page) || 1;
    const limit = 4;
    const skip = (page - 1) * limit;
    const sortOption = req.query.sort || '';

    let sortCriteria = {};

    
    switch (sortOption) {
      case 'priceAsc':
        sortCriteria = { price: 1 };
        break;
      case 'priceDesc':
        sortCriteria = { price: -1 };
        break;
      case 'nameAsc':
        sortCriteria = { productName: 1 };
        break;
      case 'nameDesc':
        sortCriteria = { productName: -1 };
        break;
      default:
        sortCriteria = {}; 
    }

    let filter = {};
    if (query) {
      filter = { productName: { $regex: query, $options: 'i' } };
    }

    const totalProducts = await Product.countDocuments(filter);
    const products = await Product.find(filter)
      .sort(sortCriteria)
      .skip(skip)
      .limit(limit);

    const totalPages = Math.ceil(totalProducts / limit);

    res.render('home', {
      products,
      query,
      currentPage: page,
      totalPages,
      sort: sortOption
    });
  } catch (error) {
    console.error("Search Error:", error);
    res.redirect('/pageNotFound');
  }
};


const productDetails = async (req, res) => {
  try {
    const userId = req.session.user;
    const userdata = await User.findById(userId);
    const productId = req.query.id;

    const product = await Product.findById(productId).populate('category');

    if (
      !product ||
      product.isDeleted ||
      !product.isListed ||
      product.isBlocked
    ) {
      return res.redirect('/');
    }

 console.log("Looking for related products:");
    console.log("Category ID:", product.category._id);
    console.log("Current Product ID:", product._id);
    console.log("Product Price:", product.price);
    console.log("Price Range:", product.price - 1000, "to", product.price + 1000);

    const minPrice = product.price - 1000;
const maxPrice = product.price + 1000;

const relatedProducts = await Product.find({
  category: product.category._id,
  _id: { $ne: product._id },
  isDeleted: false,
  isListed: true,
  price: { $gte: minPrice, $lte: maxPrice }
}).limit(4);



    res.render("product-details", {
      user: userdata,
      product,
      quantity: product.quantity,
      category: product.category,
      relatedProducts,
    });
  } catch (error) {
    console.error("Error fetching product details:", error);
    res.redirect("/pageNotFound");
  }
};


module.exports={
    productDetails,
    searchProducts
}