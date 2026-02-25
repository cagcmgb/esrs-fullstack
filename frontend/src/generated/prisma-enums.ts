// GENERATED FROM prisma/schema.prisma - do not edit manually
export enum UserRole {
	ADMIN = 'ADMIN',
	CENTRAL_OFFICE = 'CENTRAL_OFFICE',
	REGIONAL_ECONOMIST = 'REGIONAL_ECONOMIST',
	GUEST = 'GUEST'
}

export const USER_ROLES: UserRole[] = [
	UserRole.ADMIN,
	UserRole.CENTRAL_OFFICE,
	UserRole.REGIONAL_ECONOMIST,
	UserRole.GUEST
];

export interface User {
	id: string;
	name: string;
	email: string;
	username: string;
	role: UserRole;
	regionCode?: string | null;
	isActive?: boolean;
}
