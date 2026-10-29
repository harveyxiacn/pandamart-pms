import { Knex } from 'knex';
import bcrypt from 'bcrypt';

/**
 * 模拟演示数据种子 — 用于测试仪表盘、趋势图、分析页面
 * 包含：供应商、产品、库存、发票(含已确认/待处理/已驳回)、发票明细、库存日志、审计日志、通知
 * 数据覆盖过去 3 个月，模拟真实超市运营场景
 */
export async function seed(knex: Knex): Promise<void> {
  // 如果已有产品数据则跳过（防止重复插入）
  const existingProducts = await knex('products').first();
  if (existingProducts) return;

  // ============ 辅助函数 ============
  const rand = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min;
  const randFloat = (min: number, max: number, decimals = 2) =>
    Number((Math.random() * (max - min) + min).toFixed(decimals));
  const pick = <T>(arr: T[]): T => arr[rand(0, arr.length - 1)];
  const daysAgo = (days: number) => {
    const d = new Date();
    d.setDate(d.getDate() - days);
    d.setHours(rand(8, 17), rand(0, 59), rand(0, 59));
    return d;
  };
  const dateStr = (d: Date) => d.toISOString().split('T')[0];

  // ============ 1. 创建 Staff 用户 ============
  const staffExists = await knex('users').where('username', 'staff01').first();
  if (!staffExists) {
    const staffPassword = process.env.SEED_STAFF_PASSWORD || process.env.E2E_STAFF_PASSWORD;
    if (!staffPassword) {
      throw new Error('缺少 SEED_STAFF_PASSWORD（或 E2E_STAFF_PASSWORD）环境变量，无法创建演示员工账号');
    }
    if (!/^(?=.*[A-Za-z])(?=.*\d).{8,}$/.test(staffPassword)) {
      throw new Error('SEED_STAFF_PASSWORD 必须至少8位且包含字母和数字');
    }
    const passwordHash = await bcrypt.hash(staffPassword, 12);
    await knex('users').insert({
      username: 'staff01',
      password_hash: passwordHash,
      display_name: '张小明',
      email: 'staff@pandamart.com',
      role: 'staff',
      is_active: true,
    });
  }

  const adminUser = await knex('users').where('username', 'admin').first();
  const staffUser = await knex('users').where('username', 'staff01').first();
  const adminId = adminUser?.id || 1;
  const staffId = staffUser?.id || 2;

  // ============ 2. 供应商 ============
  const supplierData = [
    { name: 'CBS Wholesale', code: 'CBS', contact_name: 'John Chen', phone: '(416) 555-0101', email: 'order@cbswholesale.ca', address: '123 Food Terminal Dr, Toronto, ON', notes: '主要蔬果和冷冻供应商' },
    { name: 'Eastern Trading Co.', code: 'EAST', contact_name: 'Wei Zhang', phone: '(416) 555-0202', email: 'sales@easterntrading.ca', address: '456 Pacific Ave, Markham, ON', notes: '干货调味料进口商' },
    { name: 'Pacific Seafood Ltd.', code: 'PSL', contact_name: 'David Liu', phone: '(604) 555-0303', email: 'info@pacificseafood.ca', address: '789 Harbor Rd, Vancouver, BC', notes: '海鲜冷冻食品' },
    { name: 'Golden Dragon Foods', code: 'GDF', contact_name: 'Lisa Wang', phone: '(416) 555-0404', email: 'contact@goldendragon.ca', address: '321 Dragon St, Scarborough, ON', notes: '豆腐制品和蔬菜' },
    { name: 'Sun Valley Farms', code: 'SVF', contact_name: 'Michael Park', phone: '(905) 555-0505', email: 'order@sunvalley.ca', address: '654 Farm Rd, Richmond Hill, ON', notes: '本地蔬果农场' },
    { name: 'Asia Beverages Inc.', code: 'ABI', contact_name: 'Yuki Tanaka', phone: '(416) 555-0606', email: 'sales@asiabev.ca', address: '987 Drink Blvd, Mississauga, ON', notes: '亚洲饮料零食' },
    { name: 'Great Wall Imports', code: 'GWI', contact_name: 'Han Li', phone: '(416) 555-0707', email: 'order@greatwall.ca', address: '147 Import Lane, Toronto, ON', notes: '综合杂货进口' },
    { name: 'Fresh Meat Co.', code: 'FMC', contact_name: 'Bob Kim', phone: '(647) 555-0808', email: 'sales@freshmeat.ca', address: '258 Butcher St, North York, ON', notes: '肉类供应商' },
  ];

  await knex('suppliers').insert(supplierData.map(s => ({ ...s, is_active: true })));
  const suppliers = await knex('suppliers').select('id', 'name', 'code');
  const supplierMap: Record<string, number> = {};
  for (const s of suppliers) supplierMap[s.code] = s.id;

  // ============ 3. 获取分类 ============
  const categories = await knex('categories').select('id', 'name', 'name_en');
  const catMap: Record<string, number> = {};
  for (const c of categories) catMap[c.name_en || c.name] = c.id;

  // ============ 4. 产品 ============
  const products = [
    // 蔬菜 (Vegetables)
    { name_en: 'Napa Cabbage', name_zh: '大白菜', sku: 'VEG-001', category: 'Vegetables', supplier: 'CBS', unit: 'Case', price: 18.50 },
    { name_en: 'Bok Choy', name_zh: '小白菜', sku: 'VEG-002', category: 'Vegetables', supplier: 'CBS', unit: 'Case', price: 22.00 },
    { name_en: 'Chinese Broccoli', name_zh: '芥兰', sku: 'VEG-003', category: 'Vegetables', supplier: 'SVF', unit: 'Case', price: 24.50 },
    { name_en: 'Bean Sprouts', name_zh: '豆芽', sku: 'VEG-004', category: 'Vegetables', supplier: 'GDF', unit: 'Case', price: 12.00 },
    { name_en: 'Green Onion', name_zh: '青葱', sku: 'VEG-005', category: 'Vegetables', supplier: 'SVF', unit: 'Bunch', price: 1.50 },
    { name_en: 'Ginger Root', name_zh: '生姜', sku: 'VEG-006', category: 'Vegetables', supplier: 'CBS', unit: 'LB', price: 3.99 },
    { name_en: 'Daikon Radish', name_zh: '白萝卜', sku: 'VEG-007', category: 'Vegetables', supplier: 'SVF', unit: 'Case', price: 15.00 },
    { name_en: 'Shanghai Bok Choy', name_zh: '上海青', sku: 'VEG-008', category: 'Vegetables', supplier: 'CBS', unit: 'Case', price: 20.00 },

    // 水果 (Fruits)
    { name_en: 'Asian Pear', name_zh: '水晶梨', sku: 'FRT-001', category: 'Fruits', supplier: 'CBS', unit: 'Case', price: 32.00 },
    { name_en: 'Mandarin Orange', name_zh: '橘子', sku: 'FRT-002', category: 'Fruits', supplier: 'CBS', unit: 'Case', price: 28.00 },
    { name_en: 'Dragon Fruit', name_zh: '火龙果', sku: 'FRT-003', category: 'Fruits', supplier: 'SVF', unit: 'Case', price: 45.00 },
    { name_en: 'Lychee', name_zh: '荔枝', sku: 'FRT-004', category: 'Fruits', supplier: 'CBS', unit: 'Case', price: 38.00 },

    // 肉类 (Meat)
    { name_en: 'Pork Belly Sliced', name_zh: '五花肉片', sku: 'MEA-001', category: 'Meat', supplier: 'FMC', unit: 'Case', price: 65.00 },
    { name_en: 'Chicken Thigh Boneless', name_zh: '去骨鸡腿', sku: 'MEA-002', category: 'Meat', supplier: 'FMC', unit: 'Case', price: 48.00 },
    { name_en: 'Beef Short Rib', name_zh: '牛仔骨', sku: 'MEA-003', category: 'Meat', supplier: 'FMC', unit: 'Case', price: 85.00 },
    { name_en: 'Ground Pork', name_zh: '猪肉碎', sku: 'MEA-004', category: 'Meat', supplier: 'FMC', unit: 'Case', price: 42.00 },

    // 海鲜 (Seafood — under Meat)
    { name_en: 'Shrimp 21/25', name_zh: '大虾 21/25', sku: 'SEA-001', category: 'Meat', supplier: 'PSL', unit: 'Case', price: 72.00 },
    { name_en: 'Tilapia Fillet', name_zh: '罗非鱼片', sku: 'SEA-002', category: 'Meat', supplier: 'PSL', unit: 'Case', price: 38.00 },
    { name_en: 'Squid Whole', name_zh: '整鱿鱼', sku: 'SEA-003', category: 'Meat', supplier: 'PSL', unit: 'Case', price: 55.00 },

    // 冷冻食品 (Frozen)
    { name_en: 'Frozen Dumplings Pork', name_zh: '猪肉水饺', sku: 'FRZ-001', category: 'Frozen', supplier: 'GWI', unit: 'Bag', price: 8.99 },
    { name_en: 'Frozen Spring Rolls', name_zh: '冷冻春卷', sku: 'FRZ-002', category: 'Frozen', supplier: 'GWI', unit: 'Bag', price: 6.50 },
    { name_en: 'Frozen Buns BBQ Pork', name_zh: '叉烧包', sku: 'FRZ-003', category: 'Frozen', supplier: 'EAST', unit: 'Pack', price: 7.99 },
    { name_en: 'Frozen Edamame', name_zh: '冷冻毛豆', sku: 'FRZ-004', category: 'Frozen', supplier: 'GWI', unit: 'Bag', price: 4.50 },

    // 干货 (Dry Goods)
    { name_en: 'Jasmine Rice 25LB', name_zh: '茉莉香米 25磅', sku: 'DRY-001', category: 'Dry Goods', supplier: 'EAST', unit: 'Bag', price: 22.99 },
    { name_en: 'Soy Sauce 1.8L', name_zh: '酱油 1.8L', sku: 'DRY-002', category: 'Dry Goods', supplier: 'EAST', unit: 'Bottle', price: 4.99 },
    { name_en: 'Oyster Sauce 510g', name_zh: '蚝油 510g', sku: 'DRY-003', category: 'Dry Goods', supplier: 'EAST', unit: 'Bottle', price: 3.99 },
    { name_en: 'Sesame Oil 500ml', name_zh: '芝麻油 500ml', sku: 'DRY-004', category: 'Dry Goods', supplier: 'EAST', unit: 'Bottle', price: 6.99 },
    { name_en: 'Rice Noodles 400g', name_zh: '米粉 400g', sku: 'DRY-005', category: 'Dry Goods', supplier: 'GWI', unit: 'Pack', price: 2.50 },
    { name_en: 'Instant Noodles Box', name_zh: '方便面整箱', sku: 'DRY-006', category: 'Dry Goods', supplier: 'GWI', unit: 'Case', price: 18.00 },
    { name_en: 'Dried Shiitake Mushroom', name_zh: '干香菇', sku: 'DRY-007', category: 'Dry Goods', supplier: 'EAST', unit: 'Bag', price: 12.99 },

    // 饮料 (Beverages)
    { name_en: 'Coconut Water 24pk', name_zh: '椰子水 24罐', sku: 'BEV-001', category: 'Beverages', supplier: 'ABI', unit: 'Case', price: 24.00 },
    { name_en: 'Green Tea 500ml x24', name_zh: '绿茶 500ml x24', sku: 'BEV-002', category: 'Beverages', supplier: 'ABI', unit: 'Case', price: 18.00 },
    { name_en: 'Bubble Tea Kit', name_zh: '珍珠奶茶套装', sku: 'BEV-003', category: 'Beverages', supplier: 'ABI', unit: 'Box', price: 15.99 },
    { name_en: 'Soy Milk 12pk', name_zh: '豆浆 12盒', sku: 'BEV-004', category: 'Beverages', supplier: 'ABI', unit: 'Case', price: 12.00 },

    // 零食 (Snacks)
    { name_en: 'Shrimp Chips 6pk', name_zh: '虾片 6包', sku: 'SNK-001', category: 'Snacks', supplier: 'ABI', unit: 'Pack', price: 8.99 },
    { name_en: 'Pocky Chocolate 10pk', name_zh: 'Pocky巧克力 10包', sku: 'SNK-002', category: 'Snacks', supplier: 'ABI', unit: 'Box', price: 12.50 },
    { name_en: 'Seaweed Snack 12pk', name_zh: '海苔零食 12包', sku: 'SNK-003', category: 'Snacks', supplier: 'GWI', unit: 'Pack', price: 9.99 },

    // 豆腐制品 (Tofu Products)
    { name_en: 'Firm Tofu', name_zh: '老豆腐', sku: 'TOF-001', category: 'Tofu Products', supplier: 'GDF', unit: 'Case', price: 16.00 },
    { name_en: 'Silken Tofu', name_zh: '嫩豆腐', sku: 'TOF-002', category: 'Tofu Products', supplier: 'GDF', unit: 'Case', price: 18.00 },
    { name_en: 'Dried Tofu Skin', name_zh: '腐竹', sku: 'TOF-003', category: 'Tofu Products', supplier: 'GDF', unit: 'Pack', price: 5.99 },

    // 日用品 (Household)
    { name_en: 'Bamboo Chopsticks 100pk', name_zh: '竹筷子 100双', sku: 'HOU-001', category: 'Household', supplier: 'GWI', unit: 'Pack', price: 6.99 },
    { name_en: 'Takeout Containers 50pk', name_zh: '外卖盒 50个', sku: 'HOU-002', category: 'Household', supplier: 'GWI', unit: 'Pack', price: 12.99 },
  ];

  const productInserts = products.map(p => ({
    sku: p.sku,
    name_en: p.name_en,
    name_zh: p.name_zh,
    category_id: catMap[p.category] || null,
    default_supplier_id: supplierMap[p.supplier] || null,
    default_unit: p.unit,
    default_price: p.price,
    is_active: true,
  }));
  await knex('products').insert(productInserts);

  const allProducts = await knex('products').select('id', 'sku', 'name_en', 'default_price', 'default_unit', 'default_supplier_id');
  const productById: Record<number, any> = {};
  for (const p of allProducts) productById[p.id] = p;

  // ============ 5. 库存初始化 (含不同库存水平) ============
  const inventoryInserts = allProducts.map(p => {
    const safeStock = rand(3, 15);
    // 有些产品低于安全线，有些充足，有些缺货
    let quantity: number;
    const r = Math.random();
    if (r < 0.15) quantity = 0; // 15% 缺货
    else if (r < 0.35) quantity = rand(1, safeStock - 1); // 20% 低库存
    else quantity = rand(safeStock, safeStock * 3); // 65% 正常
    return {
      product_id: p.id,
      quantity,
      unit: p.default_unit,
      safe_stock: safeStock,
      last_restock_date: dateStr(daysAgo(rand(1, 14))),
      last_restock_quantity: rand(5, 30),
    };
  });
  await knex('inventory').insert(inventoryInserts);

  // ============ 6. 模拟发票 (过去90天) ============
  // 生成 60 张已确认发票 + 5 张待处理 + 3 张已驳回
  const confirmedInvoices: any[] = [];
  const pendingInvoices: any[] = [];

  // 已确认发票 — 分散在过去 90 天
  for (let i = 0; i < 60; i++) {
    // 前 8 张落在最近一周（含今天），让「今日 / 本周」统计有数据可看
    const dayOffset = i < 8 ? rand(0, 6) : rand(7, 90);
    const invDate = daysAgo(dayOffset);
    const supplier = pick(suppliers);
    const itemCount = rand(3, 12);
    const selectedProducts = [];

    // 随机挑选产品
    const shuffled = [...allProducts].sort(() => Math.random() - 0.5);
    for (let j = 0; j < Math.min(itemCount, shuffled.length); j++) {
      selectedProducts.push(shuffled[j]);
    }

    let subtotal = 0;
    const items = selectedProducts.map(p => {
      const qty = rand(1, 20);
      // 价格有小幅波动 (±15%)
      const priceVariation = 1 + (Math.random() * 0.3 - 0.15);
      const unitPrice = Number((Number(p.default_price) * priceVariation).toFixed(2));
      const lineTotal = Number((qty * unitPrice).toFixed(2));
      subtotal += lineTotal;
      return {
        product_id: p.id,
        raw_name_en: p.name_en,
        raw_name_zh: null,
        quantity: qty,
        unit: p.default_unit,
        unit_price: unitPrice,
        line_total: lineTotal,
        raw_product_code: null,
        raw_product_number: null,
        raw_un: null,
        raw_tax_code: pick(['E', 'H']),
      };
    });

    const hasTax = Math.random() > 0.4;
    const taxAmount = hasTax ? Number((subtotal * 0.13).toFixed(2)) : 0;
    const grandTotal = Number((subtotal + taxAmount).toFixed(2));
    const invoiceNumber = `INV-${supplier.code}-${String(i + 1).padStart(4, '0')}`;

    confirmedInvoices.push({
      invoice: {
        supplier_id: supplier.id,
        invoice_number: invoiceNumber,
        invoice_date: dateStr(invDate),
        subtotal,
        has_tax: hasTax ? 1 : 0,
        tax_amount: taxAmount,
        grand_total: grandTotal,
        file_path: `uploads/demo/${invoiceNumber}.pdf`,
        file_type: 'pdf',
        ocr_method: pick(['text_extract', 'ai_vision']),
        status: 'confirmed',
        uploaded_by: pick([adminId, staffId]),
        confirmed_by: adminId,
        confirmed_at: invDate,
        notes: null,
        created_at: invDate,
        updated_at: invDate,
      },
      items,
      date: invDate,
    });
  }

  // 待处理发票 — 最近几天
  for (let i = 0; i < 5; i++) {
    const dayOffset = rand(0, 3);
    const invDate = daysAgo(dayOffset);
    const supplier = pick(suppliers);
    const itemCount = rand(2, 8);
    const shuffled = [...allProducts].sort(() => Math.random() - 0.5);
    const selectedProducts = shuffled.slice(0, Math.min(itemCount, shuffled.length));

    let subtotal = 0;
    const items = selectedProducts.map(p => {
      const qty = rand(1, 15);
      const unitPrice = Number(p.default_price);
      const lineTotal = Number((qty * unitPrice).toFixed(2));
      subtotal += lineTotal;
      return {
        product_id: p.id,
        raw_name_en: p.name_en,
        raw_name_zh: null,
        quantity: qty,
        unit: p.default_unit,
        unit_price: unitPrice,
        line_total: lineTotal,
        raw_product_code: null,
        raw_product_number: null,
        raw_un: null,
        raw_tax_code: 'H',
      };
    });

    const hasTax = true;
    const taxAmount = Number((subtotal * 0.13).toFixed(2));
    const grandTotal = Number((subtotal + taxAmount).toFixed(2));
    const invoiceNumber = `INV-PEND-${String(i + 1).padStart(3, '0')}`;

    pendingInvoices.push({
      invoice: {
        supplier_id: supplier.id,
        invoice_number: invoiceNumber,
        invoice_date: dateStr(invDate),
        subtotal,
        has_tax: hasTax ? 1 : 0,
        tax_amount: taxAmount,
        grand_total: grandTotal,
        file_path: `uploads/demo/${invoiceNumber}.pdf`,
        file_type: 'pdf',
        ocr_method: 'ai_vision',
        status: 'pending',
        uploaded_by: staffId,
        confirmed_by: null,
        confirmed_at: null,
        notes: null,
        created_at: invDate,
        updated_at: invDate,
      },
      items,
    });
  }

  // 已驳回发票
  for (let i = 0; i < 3; i++) {
    const dayOffset = rand(2, 15);
    const invDate = daysAgo(dayOffset);
    const invoiceNumber = `INV-REJ-${String(i + 1).padStart(3, '0')}`;

    pendingInvoices.push({
      invoice: {
        supplier_id: pick(suppliers).id,
        invoice_number: invoiceNumber,
        invoice_date: dateStr(invDate),
        subtotal: randFloat(100, 500),
        has_tax: 0,
        tax_amount: 0,
        grand_total: randFloat(100, 500),
        file_path: `uploads/demo/${invoiceNumber}.pdf`,
        file_type: 'pdf',
        ocr_method: 'ai_vision',
        status: 'rejected',
        uploaded_by: staffId,
        confirmed_by: adminId,
        confirmed_at: daysAgo(dayOffset - 1),
        notes: pick(['OCR识别结果不正确', '重复发票', '金额不匹配']),
        created_at: invDate,
        updated_at: invDate,
      },
      items: [],
    });
  }

  // 插入所有发票和明细
  for (const inv of confirmedInvoices) {
    const [invoiceId] = await knex('invoices').insert(inv.invoice);
    if (inv.items.length > 0) {
      await knex('invoice_items').insert(
        inv.items.map((item: any) => ({ ...item, invoice_id: invoiceId }))
      );
    }
  }

  for (const inv of pendingInvoices) {
    const [invoiceId] = await knex('invoices').insert(inv.invoice);
    if (inv.items.length > 0) {
      await knex('invoice_items').insert(
        inv.items.map((item: any) => ({ ...item, invoice_id: invoiceId }))
      );
    }
  }

  // ============ 7. 库存日志 (模拟入库和出库) ============
  const allInventory = await knex('inventory').select('product_id', 'quantity');
  const invMap: Record<number, number> = {};
  for (const inv of allInventory) invMap[inv.product_id] = Number(inv.quantity);

  const logInserts: any[] = [];
  const confirmedInvRecords = await knex('invoices').where('status', 'confirmed').select('id', 'invoice_date');

  // 入库日志 — 基于已确认发票
  for (const invRecord of confirmedInvRecords) {
    const invItems = await knex('invoice_items').where('invoice_id', invRecord.id);
    for (const item of invItems) {
      if (!item.product_id) continue;
      const qty = Number(item.quantity);
      const qBefore = rand(0, 30);
      logInserts.push({
        product_id: item.product_id,
        type: 'in',
        quantity: qty,
        quantity_before: qBefore,
        quantity_after: qBefore + qty,
        invoice_id: invRecord.id,
        reason: null,
        operated_by: adminId,
        created_at: invRecord.invoice_date,
      });
    }
  }

  // 出库日志 — 模拟过去90天的销售
  for (let day = 90; day >= 1; day--) {
    const outDate = daysAgo(day);
    // 每天随机选 5~15 个产品出库
    const outCount = rand(5, 15);
    const shuffled = [...allProducts].sort(() => Math.random() - 0.5);
    for (let j = 0; j < Math.min(outCount, shuffled.length); j++) {
      const p = shuffled[j];
      const outQty = rand(1, 5);
      const qBefore = rand(outQty, 40);
      logInserts.push({
        product_id: p.id,
        type: 'out',
        quantity: -outQty,
        quantity_before: qBefore,
        quantity_after: qBefore - outQty,
        invoice_id: null,
        reason: '日常销售',
        operated_by: pick([adminId, staffId]),
        created_at: outDate,
      });
    }
  }

  // 盘点日志 — 每月一次
  for (const monthOffset of [2, 1]) {
    const stocktakeDate = daysAgo(monthOffset * 30);
    const sampledProducts = [...allProducts].sort(() => Math.random() - 0.5).slice(0, 10);
    for (const p of sampledProducts) {
      const qBefore = rand(0, 30);
      const qAfter = qBefore + rand(-3, 3);
      logInserts.push({
        product_id: p.id,
        type: 'stocktake',
        quantity: qAfter - qBefore,
        quantity_before: qBefore,
        quantity_after: Math.max(0, qAfter),
        invoice_id: null,
        reason: '月度盘点',
        operated_by: adminId,
        created_at: stocktakeDate,
      });
    }
  }

  // 批量插入日志（分批避免过大）
  const batchSize = 200;
  for (let i = 0; i < logInserts.length; i += batchSize) {
    await knex('inventory_logs').insert(logInserts.slice(i, i + batchSize));
  }

  // ============ 8. 审计日志 ============
  const auditInserts: any[] = [];

  // 登录日志
  for (let i = 0; i < 30; i++) {
    auditInserts.push({
      user_id: pick([adminId, staffId]),
      action: 'login',
      entity_type: 'user',
      entity_id: pick([adminId, staffId]),
      details: null,
      ip_address: '127.0.0.1',
      created_at: daysAgo(rand(0, 60)),
    });
  }

  // 发票操作日志
  const confirmedIds = await knex('invoices').where('status', 'confirmed').select('id', 'invoice_number');
  for (const inv of confirmedIds.slice(0, 20)) {
    auditInserts.push({
      user_id: adminId,
      action: 'confirm_invoice',
      entity_type: 'invoice',
      entity_id: inv.id,
      details: JSON.stringify({ invoiceNumber: inv.invoice_number }),
      ip_address: '127.0.0.1',
      created_at: daysAgo(rand(0, 60)),
    });
  }

  await knex('audit_logs').insert(auditInserts);

  // ============ 9. 通知 ============
  const notifInserts: any[] = [];

  // 库存预警通知
  const lowStockProducts = await knex('inventory')
    .select('inventory.product_id', 'inventory.quantity', 'inventory.safe_stock', 'products.name_en', 'products.name_zh')
    .join('products', 'inventory.product_id', 'products.id')
    .whereNotNull('inventory.safe_stock')
    .whereRaw('inventory.quantity < inventory.safe_stock')
    .limit(10);

  for (const lsp of lowStockProducts) {
    notifInserts.push({
      user_id: adminId,
      type: 'stock_alert',
      title: '库存预警',
      message: `${lsp.name_en}${lsp.name_zh ? ` (${lsp.name_zh})` : ''} 库存仅剩 ${lsp.quantity}，低于安全库存 ${lsp.safe_stock}`,
      is_read: Math.random() > 0.5 ? 1 : 0,
      link: `/inventory?productId=${lsp.product_id}`,
      created_at: daysAgo(rand(0, 7)),
    });
  }

  // 价格波动通知
  notifInserts.push(
    {
      user_id: adminId,
      type: 'price_alert',
      title: '价格异常波动',
      message: 'Pork Belly Sliced 价格从 $65.00 变为 $74.75（+15.0%）',
      is_read: 0,
      link: '/products',
      created_at: daysAgo(1),
    },
    {
      user_id: adminId,
      type: 'price_alert',
      title: '价格异常波动',
      message: 'Shrimp 21/25 价格从 $72.00 变为 $61.20（-15.0%）',
      is_read: 0,
      link: '/products',
      created_at: daysAgo(2),
    },
    {
      user_id: adminId,
      type: 'system',
      title: '系统通知',
      message: '欢迎使用熊猫超市智能库存管理系统 PandaMart PMS',
      is_read: 1,
      link: null,
      created_at: daysAgo(30),
    },
    {
      user_id: adminId,
      type: 'invoice',
      title: '新发票待审核',
      message: '张小明上传了 5 张新发票，请及时审核',
      is_read: 0,
      link: '/invoices?status=pending',
      created_at: daysAgo(0),
    }
  );

  if (notifInserts.length > 0) {
    await knex('notifications').insert(notifInserts);
  }

  console.log('✅ 演示数据已生成:');
  console.log(`   - ${suppliers.length} 个供应商`);
  console.log(`   - ${allProducts.length} 个产品`);
  console.log(`   - ${confirmedInvoices.length} 张已确认发票 + ${pendingInvoices.length} 张待处理/已驳回`);
  console.log(`   - ${logInserts.length} 条库存日志`);
  console.log(`   - ${notifInserts.length} 条通知`);
}
