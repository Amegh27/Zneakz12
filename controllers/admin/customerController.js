const User = require('../../models/userSchema');

const customerInfo = async (req, res) => {
  try {
    let search = '';
    if (req.query.search) {
      search = req.query.search;
    }

    let page = 1;
    if (req.query.page) {
      page = parseInt(req.query.page); 
    }

    const limit = 3;

    const userData = await User.find({
      isAdmin: false,
      $or: [
        { name: { $regex: ".*" + search + ".*", $options: "i" } },
        { email: { $regex: ".*" + search + ".*", $options: "i" } }
      ]
    })
      // .sort({ createdAt: -1 })
      .limit(limit)
      .skip((page - 1) * limit)
      .exec()
      
    const count = await User.countDocuments({
      isAdmin: false,
      $or: [
        { name: { $regex: ".*" + search + ".*", $options: "i" } },
        { email: { $regex: ".*" + search + ".*", $options: "i" } }
      ]
    });

    const totalPages = Math.ceil(count / limit);

    res.render('customers', {
      users: userData,
      totalPages,
      currentPage: page,
      searchQuery: search
    });

  } catch (error) {
    console.error("Customer Info Error:", error);
    res.status(500).render("admin/error", { message: "Failed to load customers" });
  }
};


const customerBlocked = async(req,res)=>{
    try {
        let id = req.query.id
        await User.updateOne({_id:id},{$set:{isBlocked:true}})
        res.redirect('/admin/users')
    } catch (error) {
        res.redirect('/pageError')
    }
}
const customerunBlocked = async(req,res)=>{
    try {
        let id = req.query.id
        await User.updateOne({_id:id},{$set:{isBlocked:false}})
        res.redirect('/admin/users')
    } catch (error) {
        res.redirect('/pageError')
    }
}


module.exports = {
  customerInfo,
  customerBlocked,
  customerunBlocked
};
