export const DEMO_MODE = import.meta.env.VITE_DEMO_MODE === "true";

export const DEMO_DB_KEY = "pandamart-demo-db-v1";

export const DEMO_ACCOUNTS = [
  { label: "管理员", username: "admin", password: "demo1234", hint: "全部模块" },
  { label: "店员", username: "staff01", password: "demo1234", hint: "进货与销售" },
] as const;

export function demoAsset(path: string): string {
  return `${import.meta.env.BASE_URL}${path.replace(/^\/+/, "")}`;
}
