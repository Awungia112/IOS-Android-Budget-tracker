import { useTranslation } from "react-i18next";

interface AddGoalCardProps {
  onClick: () => void;
}

/**
 * AddGoalCard component displays a button to create a new savings goal
 * Reverted to square shape as per user request, but maintaining visual styling
 */
export const AddGoalCard = ({ onClick }: AddGoalCardProps) => {
  const { t } = useTranslation();

  return (
    <button
      onClick={onClick}
      className="rounded-[8px] shadow-sm overflow-hidden flex flex-col items-center justify-center gap-3 transition-all w-full bg-white dark:bg-white/5 hover:bg-gray-50 dark:hover:bg-white/10 border border-black/10 dark:border-white/10"
      style={{
        height: "200px",
      }}
      aria-label={t("savingsGoals.addGoal")}
      data-testid="savings-goals-add-button"
    >
      <div
        className="flex items-center justify-center shadow-sm rounded-full"
        style={{ width: 38, height: 38 }}
      >
        <svg
          width="38"
          height="38"
          viewBox="0 0 38 38"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            d="M38 19C38 29.4927 29.4927 38 19 38C8.50732 38 0 29.4927 0 19C0 8.50732 8.50732 0 19 0C29.4927 0 38 8.50732 38 19Z"
            fill="#DEE3E4"
            fillOpacity="0.8"
          />
          <path
            d="M29.6301 16.5019H21.9389V9.12012H16.8114V16.5019H9.12012V21.4232H16.8114V28.805H21.9389V21.4232H29.6301V16.5019Z"
            className="fill-[#1A2124] dark:fill-white"
          />
        </svg>
      </div>
      <div className="text-center px-4">
        <div
          className="text-black dark:text-white font-semibold"
          style={{
            width: "100%",
            height: "28px",
            justifyContent: "center",
            display: "flex",
            flexDirection: "column",
            fontSize: "14px",
            fontFamily:
              'Inter, system-ui, -apple-system, Roboto, "Helvetica Neue", Arial',
            fontWeight: 600,
            wordWrap: "break-word",
          }}
        >
          {t("savingsGoals.addGoal")}
        </div>
      </div>
    </button>
  );
};
