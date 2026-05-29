import { Knex } from 'knex';

export async function seed(knex: Knex): Promise<void> {
  const existing = await knex('categories').first();
  if (existing) return;

  // 顶级分类
  const topCategories = [
    { name: '蔬菜', name_en: 'Vegetables', sort_order: 1 },
    { name: '水果', name_en: 'Fruits', sort_order: 2 },
    { name: '肉类', name_en: 'Meat', sort_order: 3 },
    { name: '冷冻食品', name_en: 'Frozen', sort_order: 4 },
    { name: '干货', name_en: 'Dry Goods', sort_order: 5 },
    { name: '饮料', name_en: 'Beverages', sort_order: 6 },
    { name: '零食', name_en: 'Snacks', sort_order: 7 },
    { name: '日用品', name_en: 'Household', sort_order: 8 },
    { name: '豆腐制品', name_en: 'Tofu Products', sort_order: 9 },
    { name: '其他', name_en: 'Others', sort_order: 10 },
  ];

  await knex('categories').insert(topCategories);

  // 获取顶级分类 ID
  const vegetables = await knex('categories').where('name_en', 'Vegetables').first();
  const meat = await knex('categories').where('name_en', 'Meat').first();
  const dryGoods = await knex('categories').where('name_en', 'Dry Goods').first();

  // 蔬菜子分类
  if (vegetables) {
    await knex('categories').insert([
      { name: '叶菜类', name_en: 'Leafy', parent_id: vegetables.id, sort_order: 1 },
      { name: '根茎类', name_en: 'Root', parent_id: vegetables.id, sort_order: 2 },
      { name: '瓜果类', name_en: 'Gourd', parent_id: vegetables.id, sort_order: 3 },
      { name: '豆类', name_en: 'Beans', parent_id: vegetables.id, sort_order: 4 },
    ]);
  }

  // 肉类子分类
  if (meat) {
    await knex('categories').insert([
      { name: '猪肉', name_en: 'Pork', parent_id: meat.id, sort_order: 1 },
      { name: '牛肉', name_en: 'Beef', parent_id: meat.id, sort_order: 2 },
      { name: '鸡鸭', name_en: 'Poultry', parent_id: meat.id, sort_order: 3 },
      { name: '海鲜', name_en: 'Seafood', parent_id: meat.id, sort_order: 4 },
    ]);
  }

  // 干货子分类
  if (dryGoods) {
    await knex('categories').insert([
      { name: '米面', name_en: 'Rice & Noodles', parent_id: dryGoods.id, sort_order: 1 },
      { name: '调味料', name_en: 'Seasoning', parent_id: dryGoods.id, sort_order: 2 },
      { name: '罐头', name_en: 'Canned', parent_id: dryGoods.id, sort_order: 3 },
      { name: '干货杂粮', name_en: 'Dried Grains', parent_id: dryGoods.id, sort_order: 4 },
    ]);
  }
}
