import { DEMO_DB_KEY } from "./constants";

/* ------------------------------------------------------------------ */
/* Deterministic demo data.                                           */
/*                                                                    */
/* Everything the public GitHub Pages demo shows is generated here in */
/* the browser — no backend, no real supplier documents. The seed is  */
/* deterministic for a given day so screenshots and totals are stable; */
/* only the date window slides with "today".                          */
/* ------------------------------------------------------------------ */

export interface DemoDb {
  generatedOn: string;
  users: any[];
  categories: any[];
  suppliers: any[];
  products: any[];
  inventory: any[];
  invoices: any[];
  invoiceItems: any[];
  inventoryLogs: any[];
  batches: any[];
  salesOrders: any[];
  salesItems: any[];
  payments: any[];
  aliases: any[];
  notifications: any[];
  auditLogs: any[];
  aiProviders: any[];
  settings: Record<string, string>;
  sequences: Record<string, number>;
}

const round2 = (n: number) => Math.round(n * 100) / 100;
const pad = (n: number, size: number) => String(n).padStart(size, "0");

function mulberry32(seed: number) {
  let a = seed;
  return function next() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function localDateKey(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1, 2)}-${pad(date.getDate(), 2)}`;
}

function atDay(daysBack: number, hour = 10, minute = 0): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - daysBack);
  d.setHours(hour, minute, 0, 0);
  return d;
}

const SUPPLIER_DEFS = [
  { name: "CBS Wholesale", code: "CBS", contact_name: "John Chen", phone: "(416) 555-0101", email: "order@cbswholesale.ca", address: "123 Food Terminal Dr, Toronto, ON", notes: "主要蔬果和冷冻供应商" },
  { name: "Eastern Trading Co.", code: "EAST", contact_name: "Wei Zhang", phone: "(416) 555-0202", email: "sales@easterntrading.ca", address: "456 Pacific Ave, Markham, ON", notes: "干货调味料进口商" },
  { name: "Pacific Seafood Ltd.", code: "PSL", contact_name: "David Liu", phone: "(604) 555-0303", email: "info@pacificseafood.ca", address: "789 Harbor Rd, Vancouver, BC", notes: "海鲜冷冻食品" },
  { name: "Golden Dragon Foods", code: "GDF", contact_name: "Lisa Wang", phone: "(416) 555-0404", email: "contact@goldendragon.ca", address: "321 Dragon St, Scarborough, ON", notes: "豆腐制品和蔬菜" },
  { name: "Sun Valley Farms", code: "SVF", contact_name: "Michael Park", phone: "(905) 555-0505", email: "order@sunvalley.ca", address: "654 Farm Rd, Richmond Hill, ON", notes: "本地蔬果农场" },
  { name: "Asia Beverages Inc.", code: "ABI", contact_name: "Yuki Tanaka", phone: "(416) 555-0606", email: "sales@asiabev.ca", address: "987 Drink Blvd, Mississauga, ON", notes: "亚洲饮料零食" },
  { name: "Great Wall Imports", code: "GWI", contact_name: "Han Li", phone: "(416) 555-0707", email: "order@greatwall.ca", address: "147 Import Lane, Toronto, ON", notes: "综合杂货进口" },
  { name: "Fresh Meat Co.", code: "FMC", contact_name: "Bob Kim", phone: "(647) 555-0808", email: "sales@freshmeat.ca", address: "258 Butcher St, North York, ON", notes: "肉类供应商" },
];

const CATEGORY_DEFS = [
  { name: "蔬菜", name_en: "Vegetables" },
  { name: "水果", name_en: "Fruits" },
  { name: "肉类", name_en: "Meat" },
  { name: "冷冻食品", name_en: "Frozen" },
  { name: "干货", name_en: "Dry Goods" },
  { name: "饮料", name_en: "Beverages" },
  { name: "零食", name_en: "Snacks" },
  { name: "日用品", name_en: "Household" },
  { name: "豆腐制品", name_en: "Tofu Products" },
  { name: "其他", name_en: "Others" },
];

const CHILD_CATEGORIES: Record<string, string[]> = {
  Vegetables: ["叶菜类", "根茎类", "瓜果类", "豆类"],
  Meat: ["猪肉", "牛肉", "鸡鸭", "海鲜"],
  "Dry Goods": ["米面", "调味料", "罐头", "干货杂粮"],
};

interface ProductDef {
  name_en: string;
  name_zh: string;
  sku: string;
  category: string;
  supplier: string;
  unit: string;
  price: number;
}

const PRODUCT_DEFS: ProductDef[] = [
  { name_en: "Napa Cabbage", name_zh: "大白菜", sku: "VEG-001", category: "Vegetables", supplier: "CBS", unit: "Case", price: 18.5 },
  { name_en: "Bok Choy", name_zh: "小白菜", sku: "VEG-002", category: "Vegetables", supplier: "CBS", unit: "Case", price: 22.0 },
  { name_en: "Chinese Broccoli", name_zh: "芥兰", sku: "VEG-003", category: "Vegetables", supplier: "SVF", unit: "Case", price: 24.5 },
  { name_en: "Bean Sprouts", name_zh: "豆芽", sku: "VEG-004", category: "Vegetables", supplier: "GDF", unit: "Case", price: 12.0 },
  { name_en: "Green Onion", name_zh: "青葱", sku: "VEG-005", category: "Vegetables", supplier: "SVF", unit: "Bunch", price: 1.5 },
  { name_en: "Ginger Root", name_zh: "生姜", sku: "VEG-006", category: "Vegetables", supplier: "CBS", unit: "LB", price: 3.99 },
  { name_en: "Daikon Radish", name_zh: "白萝卜", sku: "VEG-007", category: "Vegetables", supplier: "SVF", unit: "Case", price: 15.0 },
  { name_en: "Shanghai Bok Choy", name_zh: "上海青", sku: "VEG-008", category: "Vegetables", supplier: "CBS", unit: "Case", price: 20.0 },
  { name_en: "Asian Pear", name_zh: "水晶梨", sku: "FRT-001", category: "Fruits", supplier: "CBS", unit: "Case", price: 32.0 },
  { name_en: "Mandarin Orange", name_zh: "橘子", sku: "FRT-002", category: "Fruits", supplier: "CBS", unit: "Case", price: 28.0 },
  { name_en: "Dragon Fruit", name_zh: "火龙果", sku: "FRT-003", category: "Fruits", supplier: "SVF", unit: "Case", price: 45.0 },
  { name_en: "Lychee", name_zh: "荔枝", sku: "FRT-004", category: "Fruits", supplier: "CBS", unit: "Case", price: 38.0 },
  { name_en: "Pork Belly Sliced", name_zh: "五花肉片", sku: "MEA-001", category: "Meat", supplier: "FMC", unit: "Case", price: 65.0 },
  { name_en: "Chicken Thigh Boneless", name_zh: "去骨鸡腿", sku: "MEA-002", category: "Meat", supplier: "FMC", unit: "Case", price: 48.0 },
  { name_en: "Beef Short Rib", name_zh: "牛仔骨", sku: "MEA-003", category: "Meat", supplier: "FMC", unit: "Case", price: 85.0 },
  { name_en: "Ground Pork", name_zh: "猪肉碎", sku: "MEA-004", category: "Meat", supplier: "FMC", unit: "Case", price: 42.0 },
  { name_en: "Shrimp 21/25", name_zh: "大虾 21/25", sku: "SEA-001", category: "Meat", supplier: "PSL", unit: "Case", price: 72.0 },
  { name_en: "Tilapia Fillet", name_zh: "罗非鱼片", sku: "SEA-002", category: "Meat", supplier: "PSL", unit: "Case", price: 38.0 },
  { name_en: "Squid Whole", name_zh: "整鱿鱼", sku: "SEA-003", category: "Meat", supplier: "PSL", unit: "Case", price: 55.0 },
  { name_en: "Frozen Dumplings Pork", name_zh: "猪肉水饺", sku: "FRZ-001", category: "Frozen", supplier: "GWI", unit: "Bag", price: 8.99 },
  { name_en: "Frozen Spring Rolls", name_zh: "冷冻春卷", sku: "FRZ-002", category: "Frozen", supplier: "GWI", unit: "Bag", price: 6.5 },
  { name_en: "Frozen Buns BBQ Pork", name_zh: "叉烧包", sku: "FRZ-003", category: "Frozen", supplier: "EAST", unit: "Pack", price: 7.99 },
  { name_en: "Frozen Edamame", name_zh: "冷冻毛豆", sku: "FRZ-004", category: "Frozen", supplier: "GWI", unit: "Bag", price: 4.5 },
  { name_en: "Jasmine Rice 25LB", name_zh: "茉莉香米 25磅", sku: "DRY-001", category: "Dry Goods", supplier: "EAST", unit: "Bag", price: 22.99 },
  { name_en: "Soy Sauce 1.8L", name_zh: "酱油 1.8L", sku: "DRY-002", category: "Dry Goods", supplier: "EAST", unit: "Bottle", price: 4.99 },
  { name_en: "Oyster Sauce 510g", name_zh: "蚝油 510g", sku: "DRY-003", category: "Dry Goods", supplier: "EAST", unit: "Bottle", price: 3.99 },
  { name_en: "Sesame Oil 500ml", name_zh: "芝麻油 500ml", sku: "DRY-004", category: "Dry Goods", supplier: "EAST", unit: "Bottle", price: 6.99 },
  { name_en: "Rice Noodles 400g", name_zh: "米粉 400g", sku: "DRY-005", category: "Dry Goods", supplier: "GWI", unit: "Pack", price: 2.5 },
  { name_en: "Instant Noodles Box", name_zh: "方便面整箱", sku: "DRY-006", category: "Dry Goods", supplier: "GWI", unit: "Case", price: 18.0 },
  { name_en: "Dried Shiitake Mushroom", name_zh: "干香菇", sku: "DRY-007", category: "Dry Goods", supplier: "EAST", unit: "Bag", price: 12.99 },
  { name_en: "Coconut Water 24pk", name_zh: "椰子水 24罐", sku: "BEV-001", category: "Beverages", supplier: "ABI", unit: "Case", price: 24.0 },
  { name_en: "Green Tea 500ml x24", name_zh: "绿茶 500ml x24", sku: "BEV-002", category: "Beverages", supplier: "ABI", unit: "Case", price: 18.0 },
  { name_en: "Bubble Tea Kit", name_zh: "珍珠奶茶套装", sku: "BEV-003", category: "Beverages", supplier: "ABI", unit: "Box", price: 15.99 },
  { name_en: "Soy Milk 12pk", name_zh: "豆浆 12盒", sku: "BEV-004", category: "Beverages", supplier: "ABI", unit: "Case", price: 12.0 },
  { name_en: "Shrimp Chips 6pk", name_zh: "虾片 6包", sku: "SNK-001", category: "Snacks", supplier: "ABI", unit: "Pack", price: 8.99 },
  { name_en: "Pocky Chocolate 10pk", name_zh: "Pocky巧克力 10包", sku: "SNK-002", category: "Snacks", supplier: "ABI", unit: "Box", price: 12.5 },
  { name_en: "Seaweed Snack 12pk", name_zh: "海苔零食 12包", sku: "SNK-003", category: "Snacks", supplier: "GWI", unit: "Pack", price: 9.99 },
  { name_en: "Firm Tofu", name_zh: "老豆腐", sku: "TOF-001", category: "Tofu Products", supplier: "GDF", unit: "Case", price: 16.0 },
  { name_en: "Silken Tofu", name_zh: "嫩豆腐", sku: "TOF-002", category: "Tofu Products", supplier: "GDF", unit: "Case", price: 18.0 },
  { name_en: "Dried Tofu Skin", name_zh: "腐竹", sku: "TOF-003", category: "Tofu Products", supplier: "GDF", unit: "Pack", price: 5.99 },
  { name_en: "Bamboo Chopsticks 100pk", name_zh: "竹筷子 100双", sku: "HOU-001", category: "Household", supplier: "GWI", unit: "Pack", price: 6.99 },
  { name_en: "Takeout Containers 50pk", name_zh: "外卖盒 50个", sku: "HOU-002", category: "Household", supplier: "GWI", unit: "Pack", price: 12.99 },
];

const SHELF_LIFE: Record<string, number | null> = {
  VEG: 7,
  FRT: 12,
  MEA: 6,
  SEA: 45,
  TOF: 14,
  FRZ: 240,
};

export function createDemoDb(): DemoDb {
  const rnd = mulberry32(20261029);
  const todayKey = localDateKey(new Date());
  const rand = (min: number, max: number) => Math.floor(rnd() * (max - min + 1)) + min;
  const pick = <T>(arr: T[]): T => arr[Math.floor(rnd() * arr.length)];
  const shuffle = <T>(arr: T[]): T[] => {
    const copy = [...arr];
    for (let i = copy.length - 1; i > 0; i -= 1) {
      const j = Math.floor(rnd() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  };

  const db: DemoDb = {
    generatedOn: todayKey,
    users: [],
    categories: [],
    suppliers: [],
    products: [],
    inventory: [],
    invoices: [],
    invoiceItems: [],
    inventoryLogs: [],
    batches: [],
    salesOrders: [],
    salesItems: [],
    payments: [],
    aliases: [],
    notifications: [],
    auditLogs: [],
    aiProviders: [],
    settings: {},
    sequences: { invoiceItem: 0, log: 0, batch: 0, salesItem: 0, payment: 0, alias: 0, notification: 0, audit: 0 },
  };

  /* ── users ─────────────────────────────────────────────────── */
  db.users = [
    {
      id: 1,
      username: "admin",
      password: "demo1234",
      display_name: "王建国",
      email: "admin@pandamart.demo",
      role: "admin",
      is_active: true,
      created_at: atDay(180, 9).toISOString(),
      last_login_at: atDay(0, 8, 42).toISOString(),
    },
    {
      id: 2,
      username: "staff01",
      password: "demo1234",
      display_name: "张小明",
      email: "staff@pandamart.demo",
      role: "staff",
      is_active: true,
      created_at: atDay(120, 10).toISOString(),
      last_login_at: atDay(0, 8, 5).toISOString(),
    },
    {
      id: 3,
      username: "liujing",
      password: "demo1234",
      display_name: "李静",
      email: "liujing@pandamart.demo",
      role: "staff",
      is_active: false,
      created_at: atDay(60, 11).toISOString(),
      last_login_at: atDay(12, 17).toISOString(),
    },
  ];

  /* ── categories ────────────────────────────────────────────── */
  let categoryId = 0;
  for (const [index, cat] of CATEGORY_DEFS.entries()) {
    categoryId += 1;
    db.categories.push({
      id: categoryId,
      name: cat.name,
      name_en: cat.name_en,
      parent_id: null,
      sort_order: index + 1,
    });
  }
  for (const [parentNameEn, children] of Object.entries(CHILD_CATEGORIES)) {
    const parent = db.categories.find((c) => c.name_en === parentNameEn);
    for (const [index, childName] of children.entries()) {
      categoryId += 1;
      db.categories.push({
        id: categoryId,
        name: childName,
        name_en: `${parentNameEn} / ${childName}`,
        parent_id: parent?.id ?? null,
        sort_order: index + 1,
      });
    }
  }
  const categoryByNameEn = new Map(db.categories.map((c) => [c.name_en, c.id]));

  /* ── suppliers ─────────────────────────────────────────────── */
  db.suppliers = SUPPLIER_DEFS.map((supplier, index) => ({
    id: index + 1,
    ...supplier,
    is_active: true,
    created_at: atDay(200 - index * 5, 9).toISOString(),
  }));
  const supplierByCode = new Map(db.suppliers.map((s) => [s.code, s]));

  /* ── products + inventory ──────────────────────────────────── */
  db.products = PRODUCT_DEFS.map((def, index) => {
    const id = index + 1;
    const supplier = supplierByCode.get(def.supplier)!;
    const prefix = def.sku.split("-")[0];
    const shelfLife = SHELF_LIFE[prefix] ?? null;
    const markup = 1.28 + ((id * 37) % 21) / 100;
    return {
      id,
      sku: def.sku,
      barcode: `89${pad(1000000 + id * 37, 11)}`,
      name_en: def.name_en,
      name_zh: def.name_zh,
      category_id: categoryByNameEn.get(def.category) ?? null,
      category_name: db.categories.find((c) => c.name_en === def.category)?.name ?? null,
      default_supplier_id: supplier.id,
      supplier_name: supplier.name,
      default_unit: def.unit,
      default_price: def.price,
      selling_price: round2(def.price * markup),
      is_perishable: shelfLife !== null,
      shelf_life_days: shelfLife,
      image_url: null,
      notes: null,
      is_active: true,
      deleted_at: null,
      created_at: atDay(150 - index, 9).toISOString(),
      updated_at: atDay(30, 9).toISOString(),
    };
  });

  db.inventory = db.products.map((product, index) => {
    const safeStock = rand(4, 15);
    const roll = rnd();
    let quantity: number;
    if (roll < 0.1) quantity = 0;
    else if (roll < 0.28) quantity = rand(1, Math.max(1, safeStock - 1));
    else quantity = rand(safeStock, safeStock * 3);
    return {
      id: index + 1,
      product_id: product.id,
      store_id: 1,
      quantity,
      unit: product.default_unit,
      safe_stock: safeStock,
      last_restock_date: localDateKey(atDay(rand(1, 14))),
      last_restock_quantity: rand(5, 30),
      created_at: atDay(150, 9).toISOString(),
      updated_at: atDay(0, 9).toISOString(),
    };
  });

  /* ── invoices ──────────────────────────────────────────────── */
  const makeOcrResult = (invoice: any, items: any[], supplier: any) => ({
    supplierName: supplier?.name ?? null,
    supplierCode: supplier?.code ?? null,
    supplierAddress: supplier?.address ?? null,
    supplierContact: supplier ? `${supplier.contact_name} · ${supplier.phone}` : null,
    invoiceNumber: invoice.invoice_number,
    invoiceDate: invoice.invoice_date,
    customerCode: invoice.customer_code,
    items: items.map((item) => ({
      productNameEn: item.raw_name_en,
      productNameZh: item.raw_name_zh,
      productCode: item.raw_product_code,
      productNumber: item.raw_product_number,
      un: item.raw_un,
      taxCode: item.raw_tax_code,
      quantity: item.quantity,
      unit: item.unit,
      unitPrice: item.unit_price,
      lineTotal: item.line_total,
    })),
    salesTotal: invoice.subtotal,
    taxTotal: invoice.tax_amount,
    total: invoice.grand_total,
    subtotal: invoice.subtotal,
    hasTax: !!invoice.has_tax,
    taxAmount: invoice.tax_amount,
    grandTotal: invoice.grand_total,
  });

  const buildInvoice = (options: {
    dayOffset: number;
    status: "pending" | "confirmed" | "rejected";
    supplier: any | null;
    invoiceNumber: string;
    itemCount: number;
    notes?: string | null;
  }) => {
    const { dayOffset, status, supplier, invoiceNumber, itemCount, notes = null } = options;
    const hour = dayOffset === 0 ? Math.max(9, new Date().getHours() - 1) : rand(9, 18);
    const createdAt = atDay(dayOffset, hour, rand(0, 59));
    const invoiceDate = localDateKey(createdAt);
    const chosen = shuffle(db.products).slice(0, Math.min(itemCount, db.products.length));

    let subtotal = 0;
    const items = chosen.map((product) => {
      const quantity = rand(1, 18);
      const unitPrice = round2(Number(product.default_price) * (0.82 + rnd() * 0.36));
      const lineTotal = round2(quantity * unitPrice);
      subtotal += lineTotal;
      return {
        product_id: product.id,
        raw_name_en: product.name_en,
        raw_name_zh: product.name_zh,
        raw_product_code: null as string | null,
        raw_product_number: null as string | null,
        raw_un: product.default_unit,
        raw_tax_code: pick(["E", "H", "H"]),
        quantity,
        unit: product.default_unit,
        unit_price: unitPrice,
        line_total: lineTotal,
      };
    });
    subtotal = round2(subtotal);

    const hasTax = status !== "rejected" && rnd() > 0.3;
    const taxAmount = hasTax ? round2(subtotal * 0.13) : 0;
    const grandTotal = round2(subtotal + taxAmount);

    const invoice = {
      id: db.invoices.length + 1,
      supplier_id: supplier?.id ?? null,
      supplier_name: supplier?.name ?? null,
      invoice_number: invoiceNumber,
      invoice_date: invoiceDate,
      customer_code: `C-${pad(1000 + db.invoices.length, 4)}`,
      subtotal,
      has_tax: hasTax ? 1 : 0,
      tax_amount: taxAmount,
      grand_total: grandTotal,
      file_path: `demo/${invoiceNumber}.pdf`,
      file_type: "pdf",
      ocr_method: pick(["text_extract", "ai_vision"]),
      status,
      uploaded_by: status === "pending" ? 2 : pick([1, 2]),
      confirmed_by: status === "confirmed" ? 1 : null,
      confirmed_at: status === "confirmed" ? createdAt.toISOString() : null,
      notes,
      ocr_raw_result: null as any,
      created_at: createdAt.toISOString(),
      updated_at: createdAt.toISOString(),
    };
    // 待审核发票允许供应商未匹配，但 OCR 仍给出建议供应商，
    // 用来演示「识别出供应商 → 人工确认/选择」的完整流程。
    const ocrSupplier = supplier ?? (status === "pending" ? db.suppliers[0] : null);
    invoice.ocr_raw_result = JSON.stringify(makeOcrResult(invoice, items, ocrSupplier));

    db.invoices.push(invoice);
    for (const item of items) {
      db.invoiceItems.push({
        id: ++db.sequences.invoiceItem,
        invoice_id: invoice.id,
        ...item,
      });
    }
    return { invoice, items };
  };

  for (let i = 0; i < 60; i += 1) {
    const dayOffset = i === 0 ? 0 : i < 8 ? rand(0, 6) : rand(7, 90);
    const supplier = pick(db.suppliers);
    buildInvoice({
      dayOffset,
      status: "confirmed",
      supplier,
      invoiceNumber: `INV-${supplier.code}-${pad(i + 1, 4)}`,
      itemCount: rand(3, 8),
    });
  }

  for (let i = 0; i < 5; i += 1) {
    // 第一张故意不匹配供应商，演示「OCR 建议匹配 → 人工选择」流程。
    const supplier = i === 0 ? null : pick(db.suppliers);
    buildInvoice({
      dayOffset: rand(0, 3),
      status: "pending",
      supplier,
      invoiceNumber: `INV-PEND-${pad(i + 1, 3)}`,
      itemCount: rand(2, 6),
    });
  }

  for (let i = 0; i < 3; i += 1) {
    buildInvoice({
      dayOffset: rand(2, 15),
      status: "rejected",
      supplier: pick(db.suppliers),
      invoiceNumber: `INV-REJ-${pad(i + 1, 3)}`,
      itemCount: rand(1, 3),
      notes: pick(["OCR 识别结果不正确", "重复发票", "金额与纸质单据不一致"]),
    });
  }

  /* ── inventory logs ────────────────────────────────────────── */
  const addLog = (entry: {
    product_id: number;
    type: string;
    quantity: number;
    quantity_before: number;
    quantity_after: number;
    invoice_id?: number | null;
    sales_order_id?: number | null;
    reason?: string | null;
    operated_by: number;
    created_at: string;
  }) => {
    db.inventoryLogs.push({ id: ++db.sequences.log, store_id: 1, ...entry });
  };

  for (const invoice of db.invoices.filter((inv) => inv.status === "confirmed")) {
    const items = db.invoiceItems.filter((item) => item.invoice_id === invoice.id);
    for (const item of items) {
      const before = rand(0, 30);
      addLog({
        product_id: item.product_id,
        type: "inbound",
        quantity: item.quantity,
        quantity_before: before,
        quantity_after: before + item.quantity,
        invoice_id: invoice.id,
        reason: null,
        operated_by: 1,
        created_at: invoice.created_at,
      });
    }
  }

  for (let day = 60; day >= 0; day -= 1) {
    const created = atDay(day, rand(11, 20), rand(0, 59));
    const count = rand(4, 10);
    for (const product of shuffle(db.products).slice(0, count)) {
      const qty = rand(1, 5);
      const before = rand(qty, 45);
      addLog({
        product_id: product.id,
        type: rnd() < 0.7 ? "outbound" : "sale",
        quantity: qty,
        quantity_before: before,
        quantity_after: Math.max(0, before - qty),
        invoice_id: null,
        reason: "日常销售",
        operated_by: rnd() < 0.7 ? 2 : 1,
        created_at: created.toISOString(),
      });
    }
  }

  for (const product of shuffle(db.products).slice(0, 6)) {
    addLog({
      product_id: product.id,
      type: "adjust",
      quantity: rand(1, 4),
      quantity_before: rand(4, 20),
      quantity_after: rand(5, 24),
      reason: "破损补记",
      operated_by: 1,
      created_at: atDay(rand(3, 25), 15).toISOString(),
    });
  }
  for (const product of shuffle(db.products).slice(0, 5)) {
    addLog({
      product_id: product.id,
      type: "stocktake",
      quantity: rand(1, 3),
      quantity_before: rand(5, 18),
      quantity_after: rand(6, 21),
      reason: "月度盘点",
      operated_by: 1,
      created_at: atDay(rand(20, 50), 16).toISOString(),
    });
  }

  /* ── batches ───────────────────────────────────────────────── */
  for (const product of db.products.filter((p) => p.is_perishable)) {
    const inventory = db.inventory.find((inv) => inv.product_id === product.id);
    const quantity = inventory?.quantity ?? 0;
    if (quantity <= 0) continue;

    const lotCount = Math.min(quantity, rand(1, 3));
    const parts: number[] = [];
    let remaining = quantity;
    for (let i = 0; i < lotCount - 1; i += 1) {
      const maxPart = remaining - (lotCount - i - 1);
      const part = rand(1, Math.max(1, Math.floor(maxPart / 2)));
      parts.push(part);
      remaining -= part;
    }
    parts.push(remaining);

    const roll = rnd();
    let firstExpiryOffset: number;
    if (roll < 0.12) firstExpiryOffset = -rand(1, 6);
    else if (roll < 0.34) firstExpiryOffset = rand(1, 6);
    else firstExpiryOffset = rand(8, Number(product.shelf_life_days) + 12);

    parts.forEach((part, index) => {
      const offset = index === 0 ? firstExpiryOffset : rand(9, Number(product.shelf_life_days) + 16);
      const expiryDate = atDay(-offset);
      const receivedDate = atDay(-offset - Number(product.shelf_life_days));
      db.batches.push({
        id: ++db.sequences.batch,
        product_id: product.id,
        store_id: 1,
        batch_no: `BN-${product.sku}-${pad(index + 1, 2)}`,
        expiry_date: localDateKey(expiryDate),
        received_date: localDateKey(receivedDate),
        quantity: part,
        status: "active",
        invoice_id: null,
        note: offset < 0 ? "已过期，待报损" : offset <= 6 ? "临期，优先售出" : null,
        created_by: rnd() < 0.6 ? 1 : 2,
        created_at: atDay(rand(3, 25), 10).toISOString(),
        updated_at: atDay(rand(0, 2), 10).toISOString(),
      });
    });
  }

  /* ── sales orders ──────────────────────────────────────────── */
  let orderSeq = 0;
  for (let day = 60; day >= 0; day -= 1) {
    const created = atDay(day, 0);
    const weekend = [0, 6].includes(created.getDay());
    const orderCount = day === 0 ? rand(6, 9) : weekend ? rand(6, 10) : rand(4, 7);
    for (let i = 0; i < orderCount; i += 1) {
      orderSeq += 1;
      const itemCount = rand(1, 5);
      const chosen = shuffle(db.products).slice(0, itemCount);
      const items = chosen.map((product) => {
        const quantity = rand(1, 6);
        const promo = rnd() < 0.12 ? 0.9 : 1;
        const unitPrice = round2(Number(product.selling_price) * promo);
        return {
          product_id: product.id,
          quantity,
          unit: product.default_unit,
          unit_price: unitPrice,
          cost_price: Number(product.default_price),
          line_total: round2(unitPrice * quantity),
        };
      });
      const total = round2(items.reduce((sum, item) => sum + item.line_total, 0));
      const hour = day === 0 ? rand(8, Math.max(9, new Date().getHours())) : rand(9, 20);
      const createdAt = atDay(day, hour, rand(0, 59));
      const voided = rnd() < 0.025;
      const order = {
        id: orderSeq,
        store_id: 1,
        order_no: `SO-${localDateKey(created).replace(/-/g, "")}-${pad(orderSeq, 4)}`,
        total,
        status: voided ? "voided" : "completed",
        note: voided ? pick(["顾客取消", "重复开单", "收银误操作"]) : null,
        sold_by: rnd() < 0.75 ? 2 : 1,
        voided_by: voided ? 1 : null,
        voided_at: voided ? createdAt.toISOString() : null,
        created_at: createdAt.toISOString(),
        updated_at: createdAt.toISOString(),
      };
      db.salesOrders.push(order);
      for (const item of items) {
        db.salesItems.push({
          id: ++db.sequences.salesItem,
          sales_order_id: order.id,
          ...item,
          created_at: createdAt.toISOString(),
        });
      }
    }
  }

  /* ── supplier payments ─────────────────────────────────────── */
  const methods = ["e-transfer", "cheque", "cash", "wire"];
  for (const invoice of db.invoices.filter((inv) => inv.status === "confirmed")) {
    const roll = rnd();
    if (roll < 0.28) continue;
    const grandTotal = Number(invoice.grand_total);
    const amount = roll < 0.88 ? grandTotal : round2(grandTotal * (0.4 + rnd() * 0.3));
    const invoiceDate = new Date(`${invoice.invoice_date}T12:00:00`);
    let paidAt = new Date(invoiceDate);
    paidAt.setDate(paidAt.getDate() + rand(3, 22));
    const today = atDay(0, 0);
    if (paidAt > today) paidAt = today;
    db.payments.push({
      id: ++db.sequences.payment,
      supplier_id: invoice.supplier_id,
      invoice_id: invoice.id,
      amount,
      method: pick(methods),
      paid_at: localDateKey(paidAt),
      note: amount < grandTotal ? "部分付款" : null,
      created_by: rnd() < 0.7 ? 1 : 2,
      created_at: paidAt.toISOString(),
    });
  }

  /* ── OCR aliases ───────────────────────────────────────────── */
  for (const product of db.products) {
    if (!product.default_supplier_id) continue;
    const supplier = db.suppliers.find((s) => s.id === product.default_supplier_id);
    if (!supplier) continue;
    db.aliases.push({
      id: ++db.sequences.alias,
      supplier_id: supplier.id,
      alias_type: "code",
      alias_key: `${supplier.code}-${product.sku}`,
      product_id: product.id,
      hits: rand(1, 12),
      updated_at: atDay(rand(0, 20), 9).toISOString(),
    });
    if (rnd() < 0.5) {
      db.aliases.push({
        id: ++db.sequences.alias,
        supplier_id: supplier.id,
        alias_type: "name",
        alias_key: String(product.name_en).toLowerCase().replace(/[^a-z0-9]/g, ""),
        product_id: product.id,
        hits: rand(1, 8),
        updated_at: atDay(rand(0, 20), 9).toISOString(),
      });
    }
  }

  /* ── notifications ─────────────────────────────────────────── */
  const pushNotification = (entry: {
    type: "stock_alert" | "price_alert" | "system" | "invoice";
    title: string;
    message: string;
    is_read?: boolean;
    link: string | null;
    created_at: string;
  }) => {
    db.notifications.push({
      id: ++db.sequences.notification,
      user_id: 1,
      ...entry,
      is_read: entry.is_read ?? false,
    });
  };

  const lowStock = db.inventory.filter((inv) => inv.safe_stock != null && inv.quantity < inv.safe_stock);
  for (const inv of lowStock.slice(0, 8)) {
    const product = db.products.find((p) => p.id === inv.product_id);
    pushNotification({
      type: "stock_alert",
      title: "库存预警",
      message: `${product?.name_en ?? "商品"}${product?.name_zh ? ` (${product.name_zh})` : ""} 库存仅剩 ${inv.quantity}，低于安全库存 ${inv.safe_stock}`,
      is_read: rnd() > 0.6,
      link: `/inventory?productId=${inv.product_id}`,
      created_at: atDay(rand(0, 5), rand(8, 18)).toISOString(),
    });
  }
  const expiring = db.batches
    .filter((b) => {
      const diff = (new Date(`${b.expiry_date}T00:00:00`).getTime() - atDay(0, 0).getTime()) / 86400000;
      return b.status === "active" && b.quantity > 0 && diff <= 7;
    })
    .slice(0, 4);
  for (const batch of expiring) {
    const product = db.products.find((p) => p.id === batch.product_id);
    const expired = batch.expiry_date < todayKey;
    pushNotification({
      type: "stock_alert",
      title: expired ? "批次已过期" : "批次临期提醒",
      message: `${product?.name_en ?? "商品"}${product?.name_zh ? ` (${product.name_zh})` : ""} 批次 ${batch.batch_no} 数量 ${batch.quantity}，到期日 ${batch.expiry_date}${expired ? "，已过期请及时报损" : ""}`,
      link: "/batches",
      created_at: atDay(rand(0, 2), rand(8, 18)).toISOString(),
    });
  }
  pushNotification({
    type: "price_alert",
    title: "价格异常波动",
    message: "Pork Belly Sliced 采购价上涨 15.0%，请核对供应商报价",
    link: "/analytics",
    created_at: atDay(1, 10).toISOString(),
  });
  pushNotification({
    type: "price_alert",
    title: "价格异常波动",
    message: "Shrimp 21/25 采购价下降 12.5%，可考虑增加订货",
    is_read: true,
    link: "/analytics",
    created_at: atDay(2, 11).toISOString(),
  });
  pushNotification({
    type: "invoice",
    title: "新发票待审核",
    message: `张小明上传了 ${db.invoices.filter((inv) => inv.status === "pending").length} 张新发票，请及时审核`,
    link: "/invoices?status=pending",
    created_at: atDay(0, 9).toISOString(),
  });
  pushNotification({
    type: "system",
    title: "系统通知",
    message: "欢迎使用 PandaMart PMS 演示环境，所有数据均在浏览器内生成，可放心操作。",
    is_read: true,
    link: null,
    created_at: atDay(30, 9).toISOString(),
  });

  /* ── audit logs ────────────────────────────────────────────── */
  const addAudit = (entry: {
    user_id: number | null;
    action: string;
    entity_type: string;
    entity_id?: number | null;
    details?: unknown;
    created_at: string;
  }) => {
    db.auditLogs.push({
      id: ++db.sequences.audit,
      entity_id: null,
      ip_address: "127.0.0.1",
      ...entry,
      details: entry.details ?? null,
    });
  };

  for (let i = 0; i < 26; i += 1) {
    addAudit({
      user_id: pick([1, 2]),
      action: "login",
      entity_type: "user",
      entity_id: pick([1, 2]),
      details: null,
      created_at: atDay(rand(0, 60), rand(8, 19)).toISOString(),
    });
  }
  for (const invoice of db.invoices.filter((inv) => inv.status === "confirmed").slice(0, 20)) {
    addAudit({
      user_id: 1,
      action: "confirm_invoice",
      entity_type: "invoice",
      entity_id: invoice.id,
      details: JSON.stringify({ invoiceNumber: invoice.invoice_number }),
      created_at: invoice.confirmed_at ?? invoice.created_at,
    });
  }
  for (const order of db.salesOrders.filter((o) => o.status === "completed").slice(0, 24)) {
    addAudit({
      user_id: order.sold_by,
      action: "create_sale",
      entity_type: "sales_order",
      entity_id: order.id,
      details: JSON.stringify({ total: order.total, orderNo: order.order_no }),
      created_at: order.created_at,
    });
  }

  /* ── AI providers & settings ───────────────────────────────── */
  db.aiProviders = [
    {
      id: 1,
      name: "演示 AI（本地模拟）",
      baseUrl: "http://127.0.0.1:8317",
      apiKeyMasked: "sk-••••••••••••4f2a",
      model: "gpt-5.2",
      thinkingEffort: "xhigh",
      supportsVision: true,
      purpose: "all",
      isActive: true,
      isDefault: true,
      maxTokens: 32768,
      temperature: 0.3,
      lastTestAt: atDay(0, 8, 30).toISOString(),
      lastTestSuccess: true,
      lastTestLatencyMs: 142,
      notes: "演示环境内置，不会发起真实模型调用",
      createdAt: atDay(90, 9).toISOString(),
    },
    {
      id: 2,
      name: "备用分析模型",
      baseUrl: "https://api.example.com/v1",
      apiKeyMasked: "sk-••••••••••••9b1c",
      model: "gpt-5.2-mini",
      thinkingEffort: "medium",
      supportsVision: false,
      purpose: "analysis",
      isActive: false,
      isDefault: false,
      maxTokens: 16384,
      temperature: 0.5,
      lastTestAt: atDay(3, 14).toISOString(),
      lastTestSuccess: false,
      lastTestLatencyMs: null,
      notes: "演示用备用提供商",
      createdAt: atDay(45, 9).toISOString(),
    },
  ];

  db.settings = {
    default_safe_stock: "5",
    stock_alert_enabled: "true",
    email_notification_enabled: "false",
    notification_email: "ops@pandamart.demo",
    invoice_require_approval: "false",
    slow_moving_days: "30",
    price_alert_threshold: "0.1",
  };

  return db;
}

export function loadDemoDb(): DemoDb {
  const todayKey = localDateKey(new Date());
  try {
    const raw = localStorage.getItem(DEMO_DB_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as DemoDb;
      if (parsed?.generatedOn === todayKey && Array.isArray(parsed.products) && parsed.products.length > 0) {
        return parsed;
      }
    }
  } catch {
    /* storage unavailable — fall through to a fresh in-memory db */
  }
  const fresh = createDemoDb();
  saveDemoDb(fresh);
  return fresh;
}

export function saveDemoDb(db: DemoDb): void {
  try {
    localStorage.setItem(DEMO_DB_KEY, JSON.stringify(db));
  } catch {
    /* quota or private mode — the demo keeps working in memory */
  }
}

export function resetDemoDb(): DemoDb {
  try {
    localStorage.removeItem(DEMO_DB_KEY);
  } catch {
    /* ignore */
  }
  const fresh = createDemoDb();
  saveDemoDb(fresh);
  return fresh;
}
