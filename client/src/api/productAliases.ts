import { apiClient, unwrap } from "./client";

export type ProductAlias = {
  id: number;
  supplierId: number;
  supplierName: string;
  aliasType: "barcode" | "code" | "name";
  aliasKey: string;
  productId: number;
  productName: string;
  hits: number;
  updatedAt: string;
};

/** 已学习的「供应商商品别名」映射（管理员）。 */
export async function getProductAliases(supplierId?: number): Promise<ProductAlias[]> {
  const data = await unwrap<{ items: ProductAlias[] }>(
    apiClient.get("/product-aliases", { params: supplierId ? { supplierId } : undefined })
  );
  return data.items;
}

export function deleteProductAlias(id: number): Promise<null> {
  return unwrap(apiClient.delete(`/product-aliases/${id}`));
}
