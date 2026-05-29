/**
 * 当前为单店运行：所有库存/销售/采购写入恒用默认门店。
 * 未来支持多店时，把此常量替换为按请求解析的 storeId 即可，业务表结构无需改动。
 */
export const DEFAULT_STORE_ID = 1;
