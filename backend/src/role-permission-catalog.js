// TPOS R1: explicit real endpoint capabilities; new modules with their own CRUD keys are discovered dynamically.
export const ROLE_MODULES = [
  {"key":"einvoice_settings","name":"e-Invoice LHDN","crud":{"create":null,"read":"einvoice_settings.view","update":"einvoice_settings.manage","delete":null}},
  {"key":"kds","name":"Kitchen Display System (KDS)","crud":{"create":null,"read":"kds.view","update":"kds.update_status","delete":null}},
  {"key":"order_terminal","name":"Order Terminal","crud":{"create":"order_terminal.create","read":"order_terminal.view","update":null,"delete":null}},
  {
    "key": "users",
    "name": "Users",
    "crud": {
      "create": "users.create",
      "read": "users.view",
      "update": "users.update",
      "delete": null
    }
  },
  {
    "key": "categories",
    "name": "Categories",
    "crud": {
      "create": "categories.create",
      "read": "categories.view",
      "update": "categories.update",
      "delete": "categories.delete"
    }
  },
  {
    "key": "suppliers",
    "name": "Suppliers",
    "crud": {
      "create": "suppliers.create",
      "read": "suppliers.view",
      "update": "suppliers.update",
      "delete": "suppliers.delete"
    }
  },
  {
    "key": "products",
    "name": "Products",
    "crud": {
      "create": "products.create",
      "read": "products.view",
      "update": "products.update",
      "delete": "products.delete"
    }
  },
  {
    "key": "discounts",
    "name": "Discounts",
    "crud": {
      "create": "discounts.create",
      "read": "discounts.view",
      "update": "discounts.update",
      "delete": "discounts.delete"
    }
  },
  {
    "key": "vouchers",
    "name": "Vouchers",
    "crud": {
      "create": "vouchers.create",
      "read": "vouchers.view",
      "update": "vouchers.update",
      "delete": "vouchers.delete"
    }
  },
  {
    "key": "restaurant_tables",
    "name": "Restaurant Tables",
    "crud": {
      "create": "restaurant_tables.create",
      "read": "restaurant_tables.view",
      "update": "restaurant_tables.update",
      "delete": "restaurant_tables.delete"
    }
  },
  {
    "key": "dashboard",
    "name": "Dashboard",
    "crud": {
      "create": null,
      "read": "dashboard.view",
      "update": null,
      "delete": null
    }
  },
  {
    "key": "pos",
    "name": "POS Terminal",
    "crud": {
      "create": "pos.create",
      "read": "pos.view",
      "update": "pos.update",
      "delete": null
    }
  },
  {
    "key": "cash_shifts",
    "name": "Cash Shifts",
    "crud": {
      "create": "cash_shifts.open",
      "read": "cash_shifts.view",
      "update": null,
      "delete": null
    }
  },
  {
    "key": "cash_drawer",
    "name": "Log Cash Drawer",
    "crud": {
      "create": "cash_drawer.record.own",
      "read": "cash_drawer.view",
      "update": null,
      "delete": null
    }
  },
  {
    "key": "inventory",
    "name": "Stock / Inventory",
    "crud": {
      "create": "inventory.receive",
      "read": "inventory.view",
      "update": null,
      "delete": null
    }
  },
  {
    "key": "receipt_settings",
    "name": "Receipt Settings",
    "crud": {"create": null,"read": "receipt_settings.view","update": "receipt_settings.manage","delete": null}
  },
  {
    "key": "customer_display",
    "name": "Customer Display",
    "crud": {
      "create": null,
      "read": "customer_display.view",
      "update": "customer_display.manage",
      "delete": null
    }
  },
  {
    "key": "payment_methods",
    "name": "Payment Methods",
    "crud": {
      "create": null,
      "read": "payment_methods.view",
      "update": "payment_methods.update",
      "delete": null
    }
  },
  {
    "key": "sst_settings",
    "name": "GST / SST Settings",
    "crud": {
      "create": null,
      "read": "sst_settings.view",
      "update": "sst_settings.update",
      "delete": null
    }
  },
  {
    "key": "service_charge",
    "name": "Service Charge Settings",
    "crud": {
      "create": null,
      "read": "service_charge.view",
      "update": "service_charge.update",
      "delete": null
    }
  },
  {
    "key": "staff_profiles",
    "name": "Staff Profiles",
    "crud": {
      "create": "staff_profiles.create",
      "read": "staff_profiles.view",
      "update": "staff_profiles.update",
      "delete": null
    }
  },
  {
    "key": "attendances",
    "name": "Attendances",
    "crud": {
      "create": "attendances.create",
      "read": "attendances.view",
      "update": "attendances.update",
      "delete": null
    }
  },
  {
    "key": "attendance_clock",
    "name": "Attendance Clock",
    "crud": {
      "create": null,
      "read": "attendance_clock.view",
      "update": null,
      "delete": null
    }
  },
  {
    "key": "leave_types",
    "name": "Leave Types",
    "crud": {
      "create": "leave_types.create",
      "read": "leave_types.view",
      "update": "leave_types.update",
      "delete": null
    }
  },
  {
    "key": "leave_balances",
    "name": "Leave Balances",
    "crud": {
      "create": "leave_balances.create",
      "read": "leave_balances.view",
      "update": "leave_balances.update",
      "delete": null
    }
  },
  {
    "key": "leave_requests",
    "name": "Leave Requests",
    "crud": {
      "create": "leave_requests.create",
      "read": "leave_requests.view",
      "update": "leave_requests.update",
      "delete": null
    }
  },
  {
    "key": "role_permissions",
    "name": "Role Permission",
    "crud": {
      "create": null,
      "read": "role_permissions.view",
      "update": "role_permissions.manage",
      "delete": null
    }
  }
];
export const PLANNED_MODULES = [];
export const ROLE_CODES = ["OWNER", "ADMIN", "HR", "ACCOUNTANT", "MANAGER", "SUPERVISOR", "CASHIER", "WAITER", "KITCHEN", "STAFF"];
export const HIDDEN_PERMISSIONS = new Set(["leave_requests.import"]);
export function isVisibleSpecial(code) {return /^[a-z][a-z_]*\.[a-z][a-z_.]*$/.test(code) && !/\.(import|export)(\.|$)/.test(code) && !HIDDEN_PERMISSIONS.has(code);}
