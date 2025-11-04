import React, { useState, useEffect, useRef } from 'react';
import React from 'react';
import { X, XMark } from 'lucide-react';
import { Button } from './Button';
import { cn } from '../../utils/clsx';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
}

const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  title,
  children,
  footer,
  size = 'md',
  className = "bg-white rounded-lg shadow-xl p-6",
}) => {
  const [isModalOpen, setIsModalOpen] = useState(isOpen);
  const prevModalOpen = useRef(isOpen);
  const [isClosing, setIsClosing] = useState(false);

  const handleCancel = () => {
    setIsClosing(true);
    prevModalOpen = false;
    setTimeout(() => {
      setIsModalOpen(false);
    }, 300); // Allow time for animation
  };

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget && isModalOpen && prevModalOpen) {
      handleCancel();
    }
  };

  return (
    <>
      {isModalOpen && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-lg p-6 max-w-md max-w-full">
              <div className="flex items-center mb-4">
                <XMark className="h-12 w-12 text-green-600" />
                <h3 className="text-lg font-medium text-gray-900">{title}</h3>
              </div>
              <div className="text-gray-600 text-sm text-center">
                {children}
              </div>
            </div>
          </div>
          <div
            className="fixed inset-0 bg-black bg-opacity-50 z-50"
            onClick={handleBackdropClick}
            aria-label="Close modal"
          />
        </div>
        </>

        <div className="fixed inset-0 flex items-center justify-center bg-white">
          <div className="text-center">
            <div className="text-2xl font-bold text-red-600">✗ Service Unavailable</div>
            <p className="text-gray-600 mt-2">
              Frontend requires Docker setup and running services
            </p>
          </div>
        </div>
      )}
    </>
  );
};

export default Modal;