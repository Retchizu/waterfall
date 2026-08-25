export type Json =
	| string
	| number
	| boolean
	| null
	| { [key: string]: Json | undefined }
	| Json[];

export type Database = {
	public: {
		Tables: {
			projects: {
				Row: {
					created_at: string;
					description: string | null;
					id: string;
					issue_counter: number;
					key: string;
					name: string;
					updated_at: string;
					user_id: string;
				};
				Insert: {
					created_at?: string;
					description?: string | null;
					id?: string;
					issue_counter?: number;
					key: string;
					name: string;
					updated_at?: string;
					user_id: string;
				};
				Update: {
					created_at?: string;
					description?: string | null;
					id?: string;
					issue_counter?: number;
					key?: string;
					name?: string;
					updated_at?: string;
					user_id?: string;
				};
				Relationships: [];
			};
			issues: {
				Row: {
					completed_at: string | null;
					created_at: string;
					description: string | null;
					id: string;
					name: string;
					number: number;
					priority: number;
					project_id: string;
					status: "backlog" | "in_progress" | "done";
					updated_at: string;
				};
				Insert: {
					completed_at?: string | null;
					created_at?: string;
					description?: string | null;
					id?: string;
					name: string;
					number: number;
					priority?: number;
					project_id: string;
					status?: "backlog" | "in_progress" | "done";
					updated_at?: string;
				};
				Update: {
					completed_at?: string | null;
					created_at?: string;
					description?: string | null;
					id?: string;
					name?: string;
					number?: number;
					priority?: number;
					project_id?: string;
					status?: "backlog" | "in_progress" | "done";
					updated_at?: string;
				};
				Relationships: [
					{
						foreignKeyName: "issues_project_id_fkey";
						columns: ["project_id"];
						isOneToOne: false;
						referencedRelation: "projects";
						referencedColumns: ["id"];
					},
				];
			};
		};
		Views: Record<string, never>;
		Functions: Record<string, never>;
		Enums: Record<string, never>;
		CompositeTypes: Record<string, never>;
	};
};

export type Project = Database["public"]["Tables"]["projects"]["Row"];
