import { useEffect, useState } from 'react';
import { Card } from '../components/ui/Card';
import { Calendar, Clock, User, ChevronLeft, ChevronRight } from 'lucide-react';

interface Resource {
  id: string;
  name: string;
  type: string;
  hourly_rate: number;
  status: string;
}

interface ResourcesResponse {
  resources: Resource[];
  total: number;
}

interface Booking {
  id: string;
  resource_id: string;
  resource_name: string;
  resource_type: string;
  customer_phone: string;
  customer_name: string;
  booking_date: string;
  start_time: string;
  end_time: string;
  status: string;
  total_price: number;
  notes?: string;
  created_at: string;
}

interface BookingsResponse {
  bookings: Booking[];
  total: number;
}

interface TimeSlot {
  hour: number;
  label: string;
}

interface ScheduleCell {
  hour: number;
  isBooked: boolean;
  booking?: Booking;
}

export function Bookings() {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [resources, setResources] = useState<Resource[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState(new Date());

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      setError(null);

      const [bookingsRes, resourcesRes] = await Promise.all([
        fetch('http://localhost:3008/api/v1/bookings', {
          headers: { 'X-Tenant-Id': '00000000-0000-0000-0000-000000000001' },
        }),
        fetch('http://localhost:3008/api/v1/resources', {
          headers: { 'X-Tenant-Id': '00000000-0000-0000-0000-000000000001' },
        }),
      ]);

      if (!bookingsRes.ok || !resourcesRes.ok) {
        throw new Error('Failed to fetch data');
      }

      const bookingsData: BookingsResponse = await bookingsRes.json();
      const resourcesData: ResourcesResponse = await resourcesRes.json();

      setBookings(bookingsData.bookings || []);
      setResources(resourcesData.resources || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
      console.error('Error fetching data:', err);
    } finally {
      setLoading(false);
    }
  };

  // Format number as Rupiah
  const formatRupiah = (amount: number) => {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  // Generate time slots from 6 AM to 11 PM
  const generateTimeSlots = (): TimeSlot[] => {
    const slots: TimeSlot[] = [];
    for (let hour = 6; hour <= 23; hour++) {
      const ampm = hour >= 12 ? 'PM' : 'AM';
      const displayHour = hour % 12 || 12;
      slots.push({
        hour,
        label: `${displayHour} ${ampm}`,
      });
    }
    return slots;
  };

  // Check if a specific hour is booked for a resource on selected date
  const getScheduleForResource = (resourceId: string): ScheduleCell[] => {
    const dateStr = selectedDate.toISOString().split('T')[0];
    const timeSlots = generateTimeSlots();

    return timeSlots.map((slot) => {
      // Check if this hour is covered by any booking
      const booking = bookings.find((b) => {
        if (b.resource_id !== resourceId || !b.booking_date.startsWith(dateStr) || b.status === 'cancelled') {
          return false;
        }

        // Extract hour from start_time and end_time
        const startHour = parseInt((b.start_time.split('T')[1] || b.start_time).split(':')[0]);
        const endHour = parseInt((b.end_time.split('T')[1] || b.end_time).split(':')[0]);

        // Check if current hour falls within booking range
        return slot.hour >= startHour && slot.hour < endHour;
      });

      return {
        hour: slot.hour,
        isBooked: !!booking,
        booking,
      };
    });
  };

  const getStatusColor = (status: string) => {
    const colors = {
      pending: 'bg-yellow-100 text-yellow-800',
      confirmed: 'bg-green-100 text-green-800',
      cancelled: 'bg-red-100 text-red-800',
      completed: 'bg-blue-100 text-blue-800',
    };
    return colors[status as keyof typeof colors] || 'bg-gray-100 text-gray-800';
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('id-ID', {
      weekday: 'short',
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const formatTime = (timeString: string) => {
    const [hours, minutes] = timeString.split(':');
    const hour = parseInt(hours, 10);
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const displayHour = hour % 12 || 12;
    return `${displayHour}:${minutes} ${ampm}`;
  };

  // Date navigation
  const goToPreviousDay = () => {
    const newDate = new Date(selectedDate);
    newDate.setDate(newDate.getDate() - 1);
    setSelectedDate(newDate);
  };

  const goToNextDay = () => {
    const newDate = new Date(selectedDate);
    newDate.setDate(newDate.getDate() + 1);
    setSelectedDate(newDate);
  };

  const goToToday = () => {
    setSelectedDate(new Date());
  };

  const timeSlots = generateTimeSlots();

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Bookings Schedule</h1>
          <p className="mt-2 text-gray-600">View hourly availability for all resources</p>
        </div>
        <div className="text-sm text-gray-500">
          Total: {bookings.length} booking{bookings.length !== 1 ? 's' : ''}
        </div>
      </div>

      {/* Date Navigation */}
      <Card className="mb-6">
        <div className="flex items-center justify-between">
          <button
            onClick={goToPreviousDay}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            aria-label="Previous day"
          >
            <ChevronLeft className="h-5 w-5 text-gray-600" />
          </button>

          <div className="flex items-center gap-4">
            <div className="text-center">
              <div className="text-2xl font-bold text-gray-900">
                {selectedDate.toLocaleDateString('id-ID', {
                  weekday: 'long',
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric'
                })}
              </div>
            </div>
            <button
              onClick={goToToday}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium"
            >
              Today
            </button>
          </div>

          <button
            onClick={goToNextDay}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            aria-label="Next day"
          >
            <ChevronRight className="h-5 w-5 text-gray-600" />
          </button>
        </div>
      </Card>

      {/* Schedule Grid */}
      {loading ? (
        <Card>
          <div className="text-center py-12">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
            <p className="mt-4 text-gray-500">Loading schedule...</p>
          </div>
        </Card>
      ) : error ? (
        <Card>
          <div className="text-center py-12">
            <p className="text-red-500">Error: {error}</p>
            <button
              onClick={fetchData}
              className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              Retry
            </button>
          </div>
        </Card>
      ) : (
        <Card className="overflow-x-auto">
          <div className="min-w-full">
            {/* Legend */}
            <div className="flex items-center gap-6 mb-4 pb-4 border-b border-gray-200">
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 bg-green-100 border border-green-300 rounded"></div>
                <span className="text-sm text-gray-600">Available</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 bg-red-100 border border-red-300 rounded"></div>
                <span className="text-sm text-gray-600">Booked</span>
              </div>
            </div>

            {/* Schedule Table */}
            <div className="overflow-x-auto">
              <table className="min-w-full border-collapse">
                <thead>
                  <tr>
                    <th className="sticky left-0 z-10 bg-white border border-gray-300 px-4 py-2 text-left font-semibold text-gray-700 min-w-[150px]">
                      Resource
                    </th>
                    {timeSlots.map((slot) => (
                      <th
                        key={slot.hour}
                        className="border border-gray-300 px-2 py-2 text-center text-xs font-medium text-gray-700 min-w-[60px]"
                      >
                        {slot.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {resources.map((resource) => {
                    const schedule = getScheduleForResource(resource.id);
                    return (
                      <tr key={resource.id} className="hover:bg-gray-50">
                        <td className="sticky left-0 z-10 bg-white border border-gray-300 px-4 py-3">
                          <div>
                            <div className="font-semibold text-gray-900">{resource.name}</div>
                            <div className="text-xs text-gray-500 capitalize">{resource.type}</div>
                            <div className="text-xs text-gray-600 mt-1">{formatRupiah(resource.hourly_rate)}/hour</div>
                          </div>
                        </td>
                        {schedule.map((cell) => (
                          <td
                            key={cell.hour}
                            className={`border border-gray-300 p-0 text-center ${
                              cell.isBooked
                                ? 'bg-red-100 border-red-300'
                                : 'bg-green-50 border-green-200'
                            }`}
                            title={
                              cell.isBooked && cell.booking
                                ? `Booked by ${cell.booking.customer_name || cell.booking.customer_phone}\n${formatTime(cell.booking.start_time)} - ${formatTime(cell.booking.end_time)}\n${formatRupiah(cell.booking.total_price)}`
                                : 'Available'
                            }
                          >
                            <div className="h-12 flex items-center justify-center">
                              {cell.isBooked ? (
                                <div className="text-red-800 font-medium text-xs">
                                  ●
                                </div>
                              ) : (
                                <div className="text-green-600 text-xs">
                                  ✓
                                </div>
                              )}
                            </div>
                          </td>
                        ))}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </Card>
      )}

      {/* Bookings List Section */}
      <div className="mt-8">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">All Bookings</h2>
        {loading ? (
          <Card>
            <div className="text-center py-12">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
              <p className="mt-4 text-gray-500">Loading bookings...</p>
            </div>
          </Card>
        ) : error ? (
          <Card>
            <div className="text-center py-12">
              <p className="text-red-500">Error: {error}</p>
              <button
                onClick={fetchData}
                className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                Retry
              </button>
            </div>
          </Card>
        ) : bookings.length === 0 ? (
          <Card>
            <div className="text-center py-12">
              <Calendar className="mx-auto h-12 w-12 text-gray-400" />
              <p className="mt-4 text-gray-500">No bookings found</p>
              <p className="mt-2 text-sm text-gray-400">
                Bookings will appear here once customers make reservations
              </p>
            </div>
          </Card>
        ) : (
          <div className="grid gap-4">
            {bookings.map((booking) => (
              <Card key={booking.id} className="hover:shadow-lg transition-shadow">
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <div className="flex items-center gap-3">
                      <div>
                        <h3 className="text-lg font-semibold text-gray-900">
                          {booking.resource_name}
                        </h3>
                        <p className="text-sm text-gray-500">{booking.resource_type}</p>
                      </div>
                      <span
                        className={`px-3 py-1 rounded-full text-xs font-medium ${getStatusColor(
                          booking.status
                        )}`}
                      >
                        {booking.status.charAt(0).toUpperCase() + booking.status.slice(1)}
                      </span>
                    </div>

                    <div className="mt-4 grid grid-cols-2 gap-4">
                      <div className="flex items-center text-sm text-gray-600">
                        <User className="mr-2 h-4 w-4" />
                        <div>
                          <p className="font-medium">{booking.customer_name || 'N/A'}</p>
                          <p className="text-gray-500">{booking.customer_phone}</p>
                        </div>
                      </div>

                      <div className="flex items-center text-sm text-gray-600">
                        <Calendar className="mr-2 h-4 w-4" />
                        <div>
                          <p className="font-medium">{formatDate(booking.booking_date)}</p>
                          <div className="flex items-center text-gray-500 mt-1">
                            <Clock className="mr-1 h-3 w-3" />
                            {formatTime(booking.start_time)} - {formatTime(booking.end_time)}
                          </div>
                        </div>
                      </div>
                    </div>

                    {booking.notes && (
                      <div className="mt-3 text-sm text-gray-600">
                        <p className="font-medium">Notes:</p>
                        <p className="text-gray-500">{booking.notes}</p>
                      </div>
                    )}
                  </div>

                  {booking.total_price && (
                    <div className="text-right">
                      <p className="text-2xl font-bold text-gray-900">
                        {formatRupiah(booking.total_price)}
                      </p>
                      <p className="text-xs text-gray-500">Total Price</p>
                    </div>
                  )}
                </div>

                <div className="mt-4 pt-4 border-t border-gray-200 text-xs text-gray-500">
                  <p>Booking ID: {booking.id}</p>
                  <p className="mt-1">
                    Created: {new Date(booking.created_at).toLocaleString()}
                  </p>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
