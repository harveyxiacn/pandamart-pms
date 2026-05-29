import { useNavigate } from "react-router-dom";
import { Card } from "../components/ui/Card";
import { Button } from "../components/ui/Button";

export default function NotFoundPage() {
  const navigate = useNavigate();
  return (
    <Card>
      <h2 className="text-xl font-bold">404 - 页面不存在</h2>
      <p className="mt-2 text-sm text-slate-600">你访问的页面不存在或已被移除。</p>
      <Button className="mt-3" onClick={() => navigate("/")}>
        返回首页
      </Button>
    </Card>
  );
}
