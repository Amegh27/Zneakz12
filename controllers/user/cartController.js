const Cart = require("../../models/cartSchema");
const Product = require("../../models/productSchema");
const Category = require('../../models/categorySchema')
const User = require('../../models/userSchema')

function addToCart() {
  if (!selectedSize) {
    Swal.fire("Error", "Please select a size", "error");
    return;
  }

  const productId = document.querySelector(".add-to-cart-btn").dataset.productId;
  const quantityValue = quantity;

  fetch("/cart/add", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ productId, quantity: quantityValue, size: selectedSize })
  })
    .then(res => res.json())
    .then(data => {
      if (data.success) {
        Swal.fire({
          icon: "success",
          title: "Added to Cart",
          timer: 1000,
          showConfirmButton: false
        });
      } else {
        Swal.fire("Error", data.message || "Something went wrong", "error");
      }
    })
    .catch(err => {
      console.error(err);
      Swal.fire("Error", "Server error", "error");
    });
}






const viewCart = async (req, res) => {
  try {
    const userId = req.session.user;
    const cart = await Cart.findOne({ user: userId }).populate('items.product');

    res.render('cart', {
      cart,                    
      products: [],               
      sort: '',                    
      selectedCategory: [],       
      priceRange: '',             
      query: '',                
      currentPage: 1,             
      totalPages: 1,              
      categories: [],             
      user: req.session.user ? await User.findById(userId) : null
    });
  } catch (err) {
    console.error(err);
    res.redirect('/');
  }
};



const loadCart = async (req, res) => {
  try {
    const userId = req.session.user;
    const cart = await Cart.findOne({ user: userId }).populate("items.product");

    res.render("cart", { user: req.session.user, cart });
  } catch (error) {
    console.error("Error loading cart:", error);
    res.redirect("/pageNotFound");
  }
};

const updateCart = async (req, res) => {
  try {
    const { productId, action } = req.body;
    const userId = req.session.user;

    let cart = await Cart.findOne({ user: userId }).populate('items.product');
    if (!cart) return res.status(400).json({ error: "Cart not found" });

    const itemIndex = cart.items.findIndex(item => item.product._id.equals(productId));
    if (itemIndex > -1) {
      if (action === "increase") {
        cart.items[itemIndex].quantity++;
      } else if (action === "decrease") {
        cart.items[itemIndex].quantity--;
        if (cart.items[itemIndex].quantity <= 0) {
          cart.items.splice(itemIndex, 1);
        }
      }
    }

    cart.total = cart.items.reduce((sum, item) => {
      const productPrice = item.product.discountPrice || item.product.price;
      return sum + item.quantity * productPrice;
    }, 0);

    await cart.save();
    res.json({ success: true, total: cart.total });
  } catch (error) {
    console.error("Error updating cart:", error);
    res.status(500).json({ error: "Server Error" });
  }
};


const removeFromCart = async (req, res) => {
  try {
    const userId = req.session.user;
    const productId = req.body.productId;

    let cart = await Cart.findOne({ user: userId });
    if (!cart) return res.status(400).json({ error: "Cart not found" });

const itemIndex = cart.items.findIndex(
  item => item.product.toString() === productId.toString()
);
cart.total = cart.items.reduce((sum, item) => {
  const productPrice = item.product.discountPrice || item.product.price;
  return sum + item.quantity * productPrice;
}, 0);

    await cart.save();
    res.json({ success: true, total: cart.total });
  } catch (error) {
    console.error("Error removing item:", error);
    res.status(500).json({ error: "Server Error" });
  }
};

module.exports = { 
    addToCart, 
    viewCart,
    loadCart, 
    updateCart, 
    removeFromCart 
};
