import React from 'react';
import { Calendar, Clock, Tag, MoreHorizontal, Check, Play, Archive } from 'lucide-react';
import { Task } from '../../store/taskStore';
import { getPriorityColor, getStatusColor, formatDeadline, getDurationText } from '../../store/taskStore';
import { cn } from '../../utils/clsx';
import Button from '../Common/Button';

interface TaskCardProps {
  task: Task;
  onSelect?: (task: Task) => void;
  onComplete?: (taskId: string) => void;
  onStart?: (taskId: string) => void;
  onEdit?: (task: Task) => void;
  onDelete?: (taskId: string) => void;
  isSelected?: boolean;
  showActions?: boolean;
}

const TaskCard: React.FC<TaskCardProps> = ({
  task,
  onSelect,
  onComplete,
  onStart,
  onEdit,
  onDelete,
  isSelected = false,
  showActions = true,
}) => {
  const deadlineInfo = task.deadline ? formatDeadline(task.deadline) : null;

  return (
    <div
      className={cn(
        'bg-white rounded-lg border p-4 hover:shadow-md transition-shadow cursor-pointer',
        isSelected && 'ring-2 ring-blue-500 border-blue-500',
        task.status === 'COMPLETED' && 'opacity-75'
      )}
      onClick={() => onSelect?.(task)}
    >
      <div className="flex items-start justify-between mb-2">
        <div className="flex-1">
          <h3 className={cn(
            'font-medium text-gray-900 mb-1',
            task.status === 'COMPLETED' && 'line-through text-gray-500'
          )}>
            {task.title}
          </h3>
          {task.description && (
            <p className="text-sm text-gray-600 mb-2 line-clamp-2">
              {task.description}
            </p>
          )}
        </div>

        {showActions && (
          <div className="flex items-center space-x-1 ml-2">
            {task.status !== 'COMPLETED' && (
              <Button
                variant="ghost"
                size="sm"
                onClick={(e) => {
                  e.stopPropagation();
                  onComplete?.(task.id);
                }}
                title="Mark as complete"
              >
                <Check className="h-4 w-4" />
              </Button>
            )}

            {task.status === 'PENDING' && (
              <Button
                variant="ghost"
                size="sm"
                onClick={(e) => {
                  e.stopPropagation();
                  onStart?.(task.id);
                }}
                title="Start task"
              >
                <Play className="h-4 w-4" />
              </Button>
            )}

            <Button
              variant="ghost"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                // Show dropdown menu
              }}
              title="More options"
            >
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </div>
        )}
      </div>

      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center space-x-2">
          <span className={cn(
            'inline-flex items-center px-2 py-1 rounded-full text-xs font-medium border',
            getPriorityColor(task.priority)
          )}>
            {task.priority}
          </span>

          <span className={cn(
            'inline-flex items-center px-2 py-1 rounded-full text-xs font-medium border',
            getStatusColor(task.status)
          )}>
            {task.status.replace('_', ' ')}
          </span>
        </div>

        {task.aiScore && (
          <div className="flex items-center text-xs text-gray-500">
            <span className="font-medium">AI Score:</span>
            <span className="ml-1 font-bold text-blue-600">{task.aiScore}</span>
          </div>
        )}
      </div>

      <div className="flex items-center justify-between text-sm text-gray-600">
        <div className="flex items-center space-x-4">
          {task.subject && (
            <div className="flex items-center">
              <Tag className="h-4 w-4 mr-1" />
              <span>{task.subject}</span>
            </div>
          )}

          {task.estimatedDurationMinutes && (
            <div className="flex items-center">
              <Clock className="h-4 w-4 mr-1" />
              <span>{getDurationText(task.estimatedDurationMinutes)}</span>
            </div>
          )}

          {deadlineInfo && (
            <div className="flex items-center">
              <Calendar className="h-4 w-4 mr-1" />
              <span className={deadlineInfo.className}>{deadlineInfo.text}</span>
            </div>
          )}
        </div>
      </div>

      {task.tags.length > 0 && (
        <div className="mt-3 flex items-center flex-wrap gap-1">
          {task.tags.map((tag, index) => (
            <span
              key={index}
              className="inline-flex items-center px-2 py-1 rounded bg-gray-100 text-gray-700 text-xs"
            >
              #{tag}
            </span>
          ))}
        </div>
      )}

      {task.naturalLanguageInput && task.parsedMetadata && (
        <div className="mt-3 p-2 bg-blue-50 rounded text-xs text-blue-700">
          <div className="font-medium mb-1">Parsed from: "{task.naturalLanguageInput}"</div>
          <div className="flex items-center justify-between">
            <span>Confidence: {Math.round(task.parsedMetadata.confidence * 100)}%</span>
            {task.parsedMetadata.extractedEntities.deadline && (
              <span>Deadline: {new Date(task.parsedMetadata.extractedEntities.deadline).toLocaleDateString()}</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default TaskCard;