import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../services/api';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Label } from '../ui/Label';

interface Resource {
  id: string;
  name: string;
  hourly_rate: number;
}

interface BookingData {
  id?: string;
  resource_id: string;
  customer_phone: string;
  customer_name: string;
  booking_date: string;
  start_time: string;
  end_time: string;
}

interface BookingModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  editBooking?: BookingData;
}

export default function BookingModal({ isOpen, onClose, onSuccess, editBooking }: BookingModalProps) {
  const queryClient = useQueryClient();
  const [resourceId, setResourceId] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [bookingDate, setBookingDate] = useState('');
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');

  const isEditMode = !!editBooking;

  const { data: resourcesData, isLoading: isLoadingResources } = useQuery<{ resources: Resource[] }>({
    queryKey: ['resources'],
    queryFn: () => api.booking.get('/api/v1/resources'),
    enabled: isOpen, // Only fetch when the modal is open
  });

  useEffect(() => {
    if (isEditMode && editBooking) {
      setResourceId(editBooking.resource_id || '');
      setCustomerPhone(editBooking.customer_phone || '');
      setCustomerName(editBooking.customer_name || '');
      setBookingDate(editBooking.booking_date || '');
      setStartTime(editBooking.start_time || '');
      setEndTime(editBooking.end_time || '');
    } else {
      // Reset form
      setResourceId('');
      setCustomerPhone('');
      setCustomerName('');
      setBookingDate('');
      setStartTime('');
      setEndTime('');
    }
  }, [editBooking, isEditMode, isOpen]);

  const mutation = useMutation({
    mutationFn: (bookingData: Omit<BookingData, 'id'>) => api.booking.post('/api/v1/bookings', bookingData),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bookings'] });
      onSuccess();
      onClose();
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const bookingData = {
      resource_id: resourceId,
      customer_phone: customerPhone,
      customer_name: customerName,
      booking_date: bookingDate,
      start_time: startTime,
      end_time: endTime,
    };
    mutation.mutate(bookingData);
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={isEditMode ? 'Edit Booking' : 'Create Booking'}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <Label htmlFor="resource">Resource</Label>
          <select
            id="resource"
            value={resourceId}
            onChange={(e) => setResourceId(e.target.value)}
            required
            className="flex h-10 w-full rounded-md border border-gray-300 bg-transparent px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-950"
            disabled={isLoadingResources}
          >
            <option value="">{isLoadingResources ? 'Loading...' : 'Select a resource'}</option>
            {resourcesData?.resources.map((resource) => (
              <option key={resource.id} value={resource.id}>
                {resource.name} ({new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR' }).format(resource.hourly_rate)}/hr)
              </option>
            ))}
          </select>
        </div>
        
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label htmlFor="customerName">Customer Name</Label>
            <Input id="customerName" value={customerName} onChange={(e) => setCustomerName(e.target.value)} required />
          </div>
          <div>
            <Label htmlFor="customerPhone">Customer Phone</Label>
            <Input id="customerPhone" value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} required />
          </div>
        </div>

        <div>
          <Label htmlFor="bookingDate">Date</Label>
          <Input id="bookingDate" type="date" value={bookingDate} onChange={(e) => setBookingDate(e.target.value)} required />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label htmlFor="startTime">Start Time</Label>
            <Input id="startTime" type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} required />
          </div>
          <div>
            <Label htmlFor="endTime">End Time</Label>
            <Input id="endTime" type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} required />
          </div>
        </div>

        {mutation.isError && (
          <p className="text-sm text-red-500">{mutation.error.message}</p>
        )}

        <div className="flex justify-end gap-2">
          <Button type="button" className="bg-white text-gray-900 border border-gray-300 hover:bg-gray-50" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={mutation.isPending}>
            {mutation.isPending ? 'Saving...' : 'Save Booking'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}