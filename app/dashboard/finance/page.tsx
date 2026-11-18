import ExpenseChart from "../../components/ExpenseChart";

export default function Page() {
  return (
    <div className="dashboard-content">
      <h1 className="page-title">Finance</h1>
      <ExpenseChart />
    </div>
  );
}
