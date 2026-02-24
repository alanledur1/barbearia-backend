export interface Appointment {
    id: string;
    clientId: string;
    serviceId: string;
    appointmentDate: Date;
    status: 'pending' | 'confirmed' | 'cancelled' | 'finished';
}

