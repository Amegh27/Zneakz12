
function getDateFilter(req) {
  const filter = req.query.filter;
  const fromDate = req.query.from ? new Date(req.query.from) : null;
  const toDate = req.query.to ? new Date(req.query.to) : null;

  let start, end;

  switch (filter) {
    case "today":
      start = new Date();
      start.setHours(0, 0, 0, 0);
      end = new Date();
      end.setHours(23, 59, 59, 999);
      break;

    case "week":
      start = new Date();
      start.setDate(start.getDate() - start.getDay());
      start.setHours(0, 0, 0, 0);
      end = new Date(start);
      end.setDate(start.getDate() + 6);
      end.setHours(23, 59, 59, 999);
      break;

    case "month":
      start = new Date();
      start.setDate(1);
      start.setHours(0, 0, 0, 0);
      end = new Date();
      end.setMonth(end.getMonth() + 1, 0);
      end.setHours(23, 59, 59, 999);
      break;

      case "yearly":
  start = new Date(new Date().getFullYear(), 0, 1);
  start.setHours(0, 0, 0, 0);
  end = new Date(new Date().getFullYear(), 11, 31);
  end.setHours(23, 59, 59, 999);
  break;

    case "custom":
      if (fromDate && toDate) {
        start = fromDate;
        start.setHours(0, 0, 0, 0);
        end = toDate;
        end.setHours(23, 59, 59, 999);
      }
      break;

    default:
      start = null;
      end = null;
  }

  return { start, end };
}

module.exports = { 
    getDateFilter 
};
