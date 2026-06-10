import NetWorthWidget from "./widgets/NetWorthWidget.jsx";
import SpendingWidget from "./widgets/SpendingWidget.jsx";
import InvestmentsWidget from "./widgets/InvestmentsWidget.jsx";
import GoalsWidget from "./widgets/GoalsWidget.jsx";
import SubscriptionsWidget from "./widgets/SubscriptionsWidget.jsx";

export default function Home({ txns }) {
  return (
    <>
      <div className="dash-grid dash-large">
        <NetWorthWidget txns={txns} />
        <SpendingWidget txns={txns} />
      </div>
      <div className="dash-grid dash-medium">
        <InvestmentsWidget />
        <GoalsWidget />
        <SubscriptionsWidget txns={txns} />
      </div>
    </>
  );
}
