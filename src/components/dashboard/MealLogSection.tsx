import { MealCard, MealCardSkeleton } from '@/components/ui/MealCard';
import { formatLogHeader } from '@/lib/date';
import type { MealEntry } from '@/lib/types';

interface MealLogSectionProps {
  selectedDate: Date;
  isLoading: boolean;
  meals: MealEntry[];
  canAddFood: boolean;
  onEdit: (meal: MealEntry) => void;
  onDelete: (mealId: string) => void;
  onDuplicate: (mealId: string) => void;
}

export function MealLogSection({
  selectedDate,
  isLoading,
  meals,
  canAddFood,
  onEdit,
  onDelete,
  onDuplicate,
}: MealLogSectionProps) {
  return (
    <section>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-section-title">{formatLogHeader(selectedDate)}</h2>
        <a href="/onboarding" className="text-caption text-macro-calories hover:underline">
          Edit Goals
        </a>
      </div>

      <div className="flex flex-col gap-3">
        {isLoading ? (
          <>
            <MealCardSkeleton index={0} />
            <MealCardSkeleton index={1} />
            <MealCardSkeleton index={2} />
          </>
        ) : meals.length > 0 ? (
          meals.map((meal, index) => (
            <MealCard
              key={meal.id}
              meal={meal}
              index={index}
              onEdit={onEdit}
              onDelete={onDelete}
              onDuplicate={onDuplicate}
            />
          ))
        ) : (
          <div className="card-empty">
            <p className="text-4xl mb-4">🍽️</p>
            <p className="text-body text-text-secondary">
              {canAddFood ? 'No meals logged yet today' : 'No meals were logged this day'}
            </p>
            {canAddFood && (
              <p className="text-caption mt-2">Tap the + button to log your first meal</p>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
