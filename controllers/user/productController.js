const Product = require('../../models/productSchema')
const Category = require('../../models/categorySchema')
const User = require('../../models/userSchema')
const Cart = require("../../models/cartSchema");
const cartSchema = require('../../models/cartSchema');
const Offer = require("../../models/offerSchema"); 
const mongoose = require("mongoose");


const searchProducts = async (req, res) => {
  try {
    const query=req.query.q?.trim() || '';
    const page=parseInt(req.query.page) || 1;
    const limit=4;
    const skip=(page-1) * limit;
    const sortOption=req.query.sort || '';

    let sortCriteria={};

    
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

    let filter={};
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
    const userdata = userId ? await User.findById(userId).lean() : null;
    const productId = req.query.id;

    // fetch product with category
    const product = await Product.findById(productId).populate("category").lean();
    if (!product || product.isDeleted || !product.isListed || product.isBlocked) {
      return res.redirect("/");
    }

    const now = new Date();

    // fetch active product offer
    const productOffer = await Offer.findOne({
      offerType: "Product",
      product: new mongoose.Types.ObjectId(product._id),
      startDate: { $lte: now },
      endDate: { $gte: now },
      isActive: true
    }).lean();

    // fetch active category offer
    const categoryOffer = await Offer.findOne({
      offerType: "Category",
      category: new mongoose.Types.ObjectId(product.category?._id),
      startDate: { $lte: now },
      endDate: { $gte: now },
      isActive: true
    }).lean();

    // choose the better offer (higher effective %)
    let appliedOffer = null;
    if (productOffer && categoryOffer) {
      const productDiscountPercent =
        productOffer.discountType === "percentage"
          ? productOffer.discountValue
          : (productOffer.discountValue / product.price) * 100;

      const categoryDiscountPercent =
        categoryOffer.discountType === "percentage"
          ? categoryOffer.discountValue
          : (categoryOffer.discountValue / product.price) * 100;

      appliedOffer = productDiscountPercent >= categoryDiscountPercent ? productOffer : categoryOffer;
    } else {
      appliedOffer = productOffer || categoryOffer || null;
    }

    // prepare appliedOffer fields to pass to view (safe primitives)
    let appliedOfferFields = null;
    if (appliedOffer) {
      // compute discount price (floor to integer, not negative)
      let discountPrice = product.price;
      if (appliedOffer.discountType === "percentage") {
        discountPrice = product.price - (product.price * appliedOffer.discountValue) / 100;
      } else {
        discountPrice = product.price - appliedOffer.discountValue;
      }
      product.discountPrice = Math.max(0, Math.floor(discountPrice));

      // prepare simple fields to render to client
      appliedOfferFields = {
        id: appliedOffer._id?.toString?.() || "",
        title: appliedOffer.title || "Special Offer",
        offerType: appliedOffer.offerType || "",
        discountType: appliedOffer.discountType || "",
        discountValue: appliedOffer.discountValue ?? 0,
        // make discount string friendly
        discountString:
          appliedOffer.discountType === "percentage"
            ? `${Math.floor(appliedOffer.discountValue)}%`
            : `₹${Math.floor(appliedOffer.discountValue)}`,
        // formatted start/end dates (use ISO or locale as you prefer)
        startDateISO: appliedOffer.startDate ? new Date(appliedOffer.startDate).toISOString() : "",
        endDateISO: appliedOffer.endDate ? new Date(appliedOffer.endDate).toISOString() : "",
        // also human readable
        startDateStr: appliedOffer.startDate ? new Date(appliedOffer.startDate).toLocaleDateString("en-IN") : "—",
        endDateStr: appliedOffer.endDate ? new Date(appliedOffer.endDate).toLocaleDateString("en-IN") : "—"
      };
    } else {
      // If admin provided a product-level discountPrice already (non-offer), use that (floor)
      if (product.discountPrice && product.discountPrice < product.price) {
        product.discountPrice = Math.max(0, Math.floor(product.discountPrice));
      } else {
        product.discountPrice = product.price;
      }
    }

    // related products
    let relatedProducts = [];
    if (product.category && product.category._id) {
      relatedProducts = await Product.find({
        category: product.category._id,
        _id: { $ne: product._id },
        isDeleted: false,
        isListed: true,
      })
        .lean()
        .limit(3);
    }
    if (!relatedProducts || relatedProducts.length === 0) {
      relatedProducts = await Product.find({
        _id: { $ne: product._id },
        isDeleted: false,
        isListed: true,
      })
        .lean()
        .limit(3);
    }

    // floor discountPrice for related products as requested
    relatedProducts = relatedProducts.map((p) => {
      const dp = p.discountPrice && p.discountPrice < p.price ? Math.max(0, Math.floor(p.discountPrice)) : p.price;
      return { ...p, discountPrice: dp };
    });

    // cart count
    let cartCount = 0;
    if (userId) {
      const cart = await Cart.findOne({ user: userId }).lean();
      if (cart && cart.items && cart.items.length > 0) {
        cartCount = cart.items.reduce((acc, item) => acc + (item.quantity || 0), 0);
      }
    }

    // render with explicit appliedOffer fields (primitives)
    res.render("product-details", {
      user: userdata,
      product,
      cartCount,
      quantity: product.quantity,
      category: product.category,
      relatedProducts,
      appliedOfferFields // pass this in
    });
  } catch (error) {
    console.error("❌ Error fetching product details:", error);
    res.redirect("/pageNotFound");
  }
};




const getMenProducts = async (req, res) => {
  try {
    
    const menCategory = await Category.findOne({ name: "Men" });
    if (!menCategory) return res.send("Men category not found");

    const perPage = 3;
    const page = parseInt(req.query.page) || 1;
    const skip = (page - 1) * perPage;

    const query = req.query.q ? req.query.q.trim() : "";
    const sort = req.query.sort || "";
    const priceRange = req.query.priceRange || "";

    let matchStage = {
      category: menCategory._id,
      isBlocked: false,
      quantity: { $gt: 0 }
    };

    if (query) {
      matchStage.productName = { $regex: query, $options: "i" };
    }

    let pipeline = [
      { $match: matchStage },
      {
        $addFields: {
          effectivePrice: { $ifNull: ["$discountPrice", "$price"] }
        }
      }
    ];

    if (priceRange) {
      const [min, max] = priceRange.split("-").map(Number);
      if (!isNaN(min) && !isNaN(max)) {
        pipeline.push({
          $match: { effectivePrice: { $gte: min, $lte: max } }
        });
      }
    }

    if (sort === "priceAsc") pipeline.push({ $sort: { effectivePrice: 1 } });
    else if (sort === "priceDesc") pipeline.push({ $sort: { effectivePrice: -1 } });
    else if (sort === "nameAsc") pipeline.push({ $sort: { productName: 1 } });
    else if (sort === "nameDesc") pipeline.push({ $sort: { productName: -1 } });
    else pipeline.push({ $sort: { createdAt: -1 } }); 

    pipeline.push({ $skip: skip });
    pipeline.push({ $limit: perPage });

    const products = await Product.aggregate(pipeline);

    let countPipeline = [
      { $match: matchStage },
      {
        $addFields: {
          effectivePrice: { $ifNull: ["$discountPrice", "$price"] }
        }
      }
    ];
    if (priceRange) {
      const [min, max] = priceRange.split("-").map(Number);
      if (!isNaN(min) && !isNaN(max)) {
        countPipeline.push({
          $match: { effectivePrice: { $gte: min, $lte: max } }
        });
      }
    }
    countPipeline.push({ $count: "total" });

    const countResult = await Product.aggregate(countPipeline);
    const totalProducts = countResult[0] ? countResult[0].total : 0;
    const totalPages = Math.ceil(totalProducts / perPage);

    const categories = await Category.find({ isListed: true });

    const userData = req.session.user ? await User.findById(req.session.user) : null;

    res.render("men", {
      user: userData,
      products,
      currentPage: page,
      totalPages,
      query,
      sort,
      categories,
      selectedCategory: ["Men"],
      priceRange,
    });

  } catch (err) {
    console.error("Error loading Men products:", err);
    res.status(500).send("Server Error");
  }
};




const getWomenProducts = async (req, res) => {
  try {
    const womenCategory = await Category.findOne({ name: "Women" });
    if (!womenCategory) return res.send("Women category not found");

    const perPage = 3;
    const page = parseInt(req.query.page) || 1;
    const skip = (page - 1) * perPage;

    const query = req.query.q ? req.query.q.trim() : "";
    const sort = req.query.sort || "";
    const priceRange = req.query.priceRange || "";

    let matchStage = {
      category: womenCategory._id,
      isBlocked: false,
      quantity: { $gt: 0 }
    };

    if (query) {
      matchStage.productName = { $regex: query, $options: "i" };
    }

    let pipeline = [
      { $match: matchStage },
      { $addFields: { effectivePrice: { $ifNull: ["$discountPrice", "$price"] } } }
    ];

    if (priceRange) {
      const [min, max] = priceRange.split("-").map(Number);
      if (!isNaN(min) && !isNaN(max)) {
        pipeline.push({ $match: { effectivePrice: { $gte: min, $lte: max } } });
      }
    }

    if (sort === "priceAsc") pipeline.push({ $sort: { effectivePrice: 1 } });
    else if (sort === "priceDesc") pipeline.push({ $sort: { effectivePrice: -1 } });
    else if (sort === "nameAsc") pipeline.push({ $sort: { productName: 1 } });
    else if (sort === "nameDesc") pipeline.push({ $sort: { productName: -1 } });
    else pipeline.push({ $sort: { createdAt: -1 } });

    pipeline.push({ $skip: skip }, { $limit: perPage });

    const products = await Product.aggregate(pipeline);

    let countPipeline = [
      { $match: matchStage },
      { $addFields: { effectivePrice: { $ifNull: ["$discountPrice", "$price"] } } }
    ];
    if (priceRange) {
      const [min, max] = priceRange.split("-").map(Number);
      if (!isNaN(min) && !isNaN(max)) {
        countPipeline.push({ $match: { effectivePrice: { $gte: min, $lte: max } } });
      }
    }
    countPipeline.push({ $count: "total" });

    const countResult = await Product.aggregate(countPipeline);
    const totalProducts = countResult[0] ? countResult[0].total : 0;
    const totalPages = Math.ceil(totalProducts / perPage);

    const categories = await Category.find({ isListed: true });
    const userData = req.session.user ? await User.findById(req.session.user) : null;

    res.render("women", {
      user: userData,
      products,
      currentPage: page,
      totalPages,
      query,
      sort,
      categories,
      selectedCategory: ["Women"],
      priceRange
    });

  } catch (err) {
    console.error("Error loading Women products:", err);
    res.status(500).send("Server Error");
  }
};




const getKidsProducts = async (req, res) => {
  try {
    const kidsCategory = await Category.findOne({ name: "Kids" });
    if (!kidsCategory) return res.send("Kids category not found");

    const perPage = 3;
    const page = parseInt(req.query.page) || 1;
    const skip = (page - 1) * perPage;

    const query = req.query.q ? req.query.q.trim() : "";
    const sort = req.query.sort || "";
    const priceRange = req.query.priceRange || "";

    let matchStage = {
      category: kidsCategory._id,
      isBlocked: false,
      quantity: { $gt: 0 }
    };

    if (query) {
      matchStage.productName = { $regex: query, $options: "i" };
    }

    let pipeline = [
      { $match: matchStage },
      { $addFields: { effectivePrice: { $ifNull: ["$discountPrice", "$price"] } } }
    ];

    if (priceRange) {
      const [min, max] = priceRange.split("-").map(Number);
      if (!isNaN(min) && !isNaN(max)) {
        pipeline.push({ $match: { effectivePrice: { $gte: min, $lte: max } } });
      }
    }

    if (sort === "priceAsc") pipeline.push({ $sort: { effectivePrice: 1 } });
    else if (sort === "priceDesc") pipeline.push({ $sort: { effectivePrice: -1 } });
    else if (sort === "nameAsc") pipeline.push({ $sort: { productName: 1 } });
    else if (sort === "nameDesc") pipeline.push({ $sort: { productName: -1 } });
    else pipeline.push({ $sort: { createdAt: -1 } });

    pipeline.push({ $skip: skip }, { $limit: perPage });

    const products = await Product.aggregate(pipeline);

    let countPipeline = [
      { $match: matchStage },
      { $addFields: { effectivePrice: { $ifNull: ["$discountPrice", "$price"] } } }
    ];
    if (priceRange) {
      const [min, max] = priceRange.split("-").map(Number);
      if (!isNaN(min) && !isNaN(max)) {
        countPipeline.push({ $match: { effectivePrice: { $gte: min, $lte: max } } });
      }
    }
    countPipeline.push({ $count: "total" });

    const countResult = await Product.aggregate(countPipeline);
    const totalProducts = countResult[0] ? countResult[0].total : 0;
    const totalPages = Math.ceil(totalProducts / perPage);

    const categories = await Category.find({ isListed: true });
    const userData = req.session.user ? await User.findById(req.session.user) : null;

    res.render("kids", {
      user: userData,
      products,
      currentPage: page,
      totalPages,
      query,
      sort,
      categories,
      selectedCategory: ["Kids"],
      priceRange
    });

  } catch (err) {
    console.error("Error loading Kids products:", err);
    res.status(500).send("Server Error");
  }
};





const menDetails = async (req, res) => {
  try {
    const userId = req.session.user;
    const userdata = await User.findById(userId);
    const productId = req.query.id;

    const product = await Product.findById(productId).populate("category");

    if (!product || product.isDeleted || !product.isListed || product.isBlocked) {
      return res.redirect("/");
    }

    const minPrice = product.price - 1000;
    const maxPrice = product.price + 1000;

    const relatedProducts = await Product.find({
      category: product.category._id,
      _id: { $ne: product._id },
      isDeleted: false,
      isListed: true,
      price: { $gte: minPrice, $lte: maxPrice },
    }).limit(4);

    let cartCount = 0;
    if (userId) {
      const cart = await Cart.findOne({ userId });
      cartCount = cart ? cart.items.length : 0;
    }

    res.render("men-details", {
      user: userdata,
      product,
      quantity: product.quantity,
      category: product.category,
      relatedProducts,
      cartCount, 
    });
  } catch (error) {
    console.error("🔥 menDetails ERROR:", error);
    res.redirect("/pageNotFound");
  }
};




const womenDetails = async (req, res) => {
  try {
    const userId = req.session.user;
    const userdata = userId ? await User.findById(userId) : null;
    const productId = req.query.id;

    const product = await Product.findById(productId).populate('category');

    if (!product || product.isDeleted || !product.isListed || product.isBlocked) {
      return res.redirect('/');
    }

    const minPrice = product.price - 1000;
    const maxPrice = product.price + 1000;

    const relatedProducts = await Product.find({
      category: product.category._id,
      _id: { $ne: product._id },
      isDeleted: false,
      isListed: true,
      price: { $gte: minPrice, $lte: maxPrice }
    }).limit(4);

    let cartCount = 0;
    if (userId) {
      const cart = await Cart.findOne({ user: userId });
      if (cart && cart.items.length > 0) {
        cartCount = cart.items.reduce((acc, item) => acc + item.quantity, 0);
      }
    }

    res.render("women-details", {
      user: userdata,
      product,
      quantity: product.quantity,
      category: product.category,
      relatedProducts,
      cartCount
    });
  } catch (error) {
    console.error("Error fetching women product details:", error);
    res.redirect("/pageNotFound");
  }
};





const kidsDetails = async (req, res) => {
  try {
    const userId = req.session.user;
    const userdata = userId ? await User.findById(userId) : null;
    const productId = req.query.id;

    const product = await Product.findById(productId).populate('category');

    if (!product || product.isDeleted || !product.isListed || product.isBlocked) {
      return res.redirect('/');
    }

    const minPrice = product.price - 1000;
    const maxPrice = product.price + 1000;

    const relatedProducts = await Product.find({
      category: product.category._id,
      _id: { $ne: product._id },
      isDeleted: false,
      isListed: true,
      price: { $gte: minPrice, $lte: maxPrice }
    }).limit(4);

    // ✅ Initialize cartCount
    let cartCount = 0;
    if (userId) {
      const cart = await Cart.findOne({ user: userId });
      if (cart && cart.items.length > 0) {
        cartCount = cart.items.reduce((acc, item) => acc + item.quantity, 0);
      }
    }

    res.render("kids-details", {
      user: userdata,
      product,
      quantity: product.quantity,
      category: product.category,
      relatedProducts,
      cartCount,
      reviews: []
    });
  } catch (error) {
    console.error("Error fetching product details:", error);
    res.redirect("/pageNotFound");
  }
};



module.exports={
    productDetails,
    searchProducts,
    getMenProducts,
    getWomenProducts,
    getKidsProducts,
    menDetails,
    womenDetails,
    kidsDetails
}