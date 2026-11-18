import PageHeader from "./components/PageHeader";

export default function Home() {
  return (
    <div className="page">
      <PageHeader title="Main Dashboard" />

      <div className="dashboard-card-grid">
        <div className="summary-card">
          Finance Overview
        </div>

        <div className="summary-card">
          Tasks Summary
        </div>

        <div className="summary-card">
          Habits Progress
        </div>
      </div>
    </div>
  );
}
