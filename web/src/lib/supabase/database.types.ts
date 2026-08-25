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
			issue_statuses: {
				Row: {
					created_at: string;
					id: string;
					is_complete: boolean;
					name: string;
					position: number;
					updated_at: string;
					user_id: string;
				};
				Insert: {
					created_at?: string;
					id?: string;
					is_complete?: boolean;
					name: string;
					position: number;
					updated_at?: string;
					user_id: string;
				};
				Update: {
					created_at?: string;
					id?: string;
					is_complete?: boolean;
					name?: string;
					position?: number;
					updated_at?: string;
					user_id?: string;
				};
				Relationships: [];
			};
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
					status_id: string;
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
					status_id: string;
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
					status_id?: string;
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
					{
						foreignKeyName: "issues_status_id_fkey";
						columns: ["status_id"];
						isOneToOne: false;
						referencedRelation: "issue_statuses";
						referencedColumns: ["id"];
					},
				];
			};
		};
		Views: Record<string, never>;
		Functions: {
			add_issue_status: {
				Args: { p_name: string };
				Returns: Database["public"]["Tables"]["issue_statuses"]["Row"];
			};
			create_issue: {
				Args: {
					p_description?: string | null;
					p_name: string;
					p_priority?: number;
					p_project_id: string;
					p_status_id?: string | null;
				};
				Returns: Database["public"]["Tables"]["issues"]["Row"];
			};
			delete_issue_status: {
				Args: { p_replacement_status_id?: string | null; p_status_id: string };
				Returns: undefined;
			};
			ensure_issue_statuses: {
				Args: Record<PropertyKey, never>;
				Returns: Database["public"]["Tables"]["issue_statuses"]["Row"][];
			};
			rename_issue_status: {
				Args: { p_name: string; p_status_id: string };
				Returns: Database["public"]["Tables"]["issue_statuses"]["Row"];
			};
			reorder_issue_statuses: {
				Args: { p_status_ids: string[] };
				Returns: Database["public"]["Tables"]["issue_statuses"]["Row"][];
			};
			set_complete_issue_status: {
				Args: { p_status_id: string };
				Returns: Database["public"]["Tables"]["issue_statuses"]["Row"];
			};
			update_issue: {
				Args: {
					p_description?: string | null;
					p_issue_id: string;
					p_name: string;
					p_priority?: number;
					p_project_id: string;
					p_status_id?: string | null;
				};
				Returns: Database["public"]["Tables"]["issues"]["Row"];
			};
		};
		Enums: Record<string, never>;
		CompositeTypes: Record<string, never>;
	};
};

export type Project = Database["public"]["Tables"]["projects"]["Row"];
export type Issue = Database["public"]["Tables"]["issues"]["Row"];
export type IssueStatus = Database["public"]["Tables"]["issue_statuses"]["Row"];
