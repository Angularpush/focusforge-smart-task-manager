import React, { useState } from 'react';
import { PlusIcon, SearchIcon, FilterIcon } from 'lucide-react';
import { useTasks, useCreateTask, useTaskStats } from '../store/taskStore';
import { TaskList } from '../components/TaskManager/TaskList';
import TaskForm from '../components/TaskManager/TaskForm';
import TaskFilters from '../components/TaskManager/TaskFilters';
import { Button } from '../components/Common/Button';

const TaskManagerPage: React.FC = () => {
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [filtersVisible, setFiltersVisible] = useState(false);

  const { data: tasks, isLoading, filters, setFilters, clearFilters } = useTasks();
  const { mutate: createTask, isLoading: isCreating } = useCreateTask();
  const { data: taskStats } = useTaskStats();

  const handleSearch = (query: string) => {
    setSearchQuery(query);
    setFilters({ ...filters, search: query });
  };

  const handleFilterChange = (newFilters: typeof typeof typeof typeof) => {
    setFilters(newFilters);
  };

  const handleCreateTask = async (taskData: any) => {
    try {
      await createTask.mutateAsync(taskData);
      setShowCreateForm(false);
      // Reset form
    } catch (error) {
      console.error('Failed to create task:', error);
    }
  };

  const handleToggleCreateForm = () => {
    setShowCreateForm(!showCreateForm);
    clearError();
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Task Manager</h1>
          <p className="text-gray-600">
            Manage your tasks and track your progress
          </p>
        </div>
        <div className="flex items-center space-x-3">
          <Button
            onClick={handleToggleCreateForm}
            variant={showCreateForm ? 'secondary' : 'primary'}
          >
            <PlusIcon className="h-4 w-4 mr-2" />
            {showCreateForm ? 'Cancel' : 'Add Task'}
          </Button>
          <Button
            variant="outline"
            onClick={() => setFiltersVisible(!filtersVisible)}
          >
            <FilterIcon className="h-4 w-4 mr-2" />
            Filters
          </Button>
        </div>
      </div>

      {/* Stats Bar */}
      <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
          <div>
            <div className="text-sm text-gray-500">Total Tasks</div>
            <div className="text-2xl font-bold text-gray-900">
              {taskStats?.totalTasks || 0}
            </div>
          </div>
          <div>
            <div className="text-sm text-gray-500">Completed</div>
            <div className="text-2xl font-bold text-green-600">
              {taskStats?.completedTasks || 0}
            </div>
          </div>
          <div>
            <div className="text-sm text-gray-500">In Progress</div>
            <div className="text-2xl font-bold text-blue-600">
              {taskStats?.inProgressTasks || 0}
            </div>
          </div>
          <div>
            <div className="text-sm text-gray-500">Overdue</div>
            <div className="text-2xl font-bold text-red-600">
              {taskStats?.overdueTasks || 0}
            </div>
          </div>
        </div>
      </div>

      {/* Search and Filters */}
      <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200">
        <div className="flex flex-col sm:flex-row gap-4 items-center">
          <div className="relative flex-1">
            <SearchIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
            <input
              type="text"
              placeholder="Search tasks..."
              value={searchQuery}
              onChange={(e) => handleSearch(e.target.value)}
              className="pl-10 pr-10 py-2 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500"
            />
          </div>

          {filtersVisible && (
            <TaskFilters
              filters={filters}
              onFilterChange={handleFilterChange}
              onClear={clearFilters}
            />
          )}

          {searchQuery && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setSearchQuery('')}
            >
              Clear
            </Button>
          )}
        </div>
      </div>

      {/* Task Form Modal */}
      {showCreateForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md mx-4 max-h-screen overflow-y-auto">
            <TaskForm
              onSubmit={handleCreateTask}
              onCancel={() => handleToggleCreateForm()}
              isLoading={isCreating}
            />
          </div>
        </div>
      )}

      {/* Task List */}
      <TaskList
        tasks={tasks?.data || []}
        isLoading={isLoading}
        onEdit={(task) => {
          // TODO: Implement edit functionality
          console.log('Edit task:', task);
        }}
        onDelete={(task) => {
          // TODO: Implement delete functionality
          console.log('Delete task:', task);
        }}
      />
    </div>
  );
};

export default TaskManagerPage;