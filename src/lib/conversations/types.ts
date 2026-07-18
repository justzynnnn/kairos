export type MessageType="text"|"system_reminder"|"system_lateness"|"meeting_card"|"repair_card";
export type AttachmentCard={id:string;name:string;mimeType:string;sizeBytes:number;downloadPath:string;previewable:boolean};
export type ConversationMessage={id:string;conversationId:string;senderId:string|null;senderName:string;senderKind:"user"|"system";type:MessageType;body:string;isMine:boolean;private:boolean;relatedMeetingId:string|null;createdAt:string;attachments:AttachmentCard[]};
export type ConversationView={id:string;otherUser:{id:string;name:string;email:string};messages:ConversationMessage[]};
