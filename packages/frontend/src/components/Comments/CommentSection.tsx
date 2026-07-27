import { useState, type FormEvent } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import apiClient from '../../api/client';
import { LoadingSpinner } from '../common/LoadingSpinner';
import { ErrorDisplay } from '../common/ErrorDisplay';
import { EmptyState } from '../common/EmptyState';
import { format } from 'date-fns';
import toast from 'react-hot-toast';
import type { TaskComment } from '@wrike-clone/shared';

interface CommentSectionProps {
  taskId: string;
}

export function CommentSection({ taskId }: CommentSectionProps) {
  const queryClient = useQueryClient();
  const [newComment, setNewComment] = useState('');
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [replyContent, setReplyContent] = useState('');

  const {
    data: comments,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ['comments', taskId],
    queryFn: async () => {
      const { data } = await apiClient.get<TaskComment[]>(`/tasks/${taskId}/comments`);
      return data;
    },
  });

  const createComment = useMutation({
    mutationFn: async (content: string) => {
      await apiClient.post(`/tasks/${taskId}/comments`, {
        taskId,
        content,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['comments', taskId] });
      setNewComment('');
      toast.success('Comment added');
    },
    onError: () => toast.error('Failed to add comment'),
  });

  const createReply = useMutation({
    mutationFn: async ({
      content,
      parentCommentId,
    }: {
      content: string;
      parentCommentId: string;
    }) => {
      await apiClient.post(`/tasks/${taskId}/comments`, {
        taskId,
        content,
        parentCommentId,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['comments', taskId] });
      setReplyContent('');
      setReplyTo(null);
      toast.success('Reply added');
    },
    onError: () => toast.error('Failed to add reply'),
  });

  const handleSubmitComment = (e: FormEvent) => {
    e.preventDefault();
    if (!newComment.trim()) return;
    createComment.mutate(newComment.trim());
  };

  const handleSubmitReply = (e: FormEvent, parentId: string) => {
    e.preventDefault();
    if (!replyContent.trim()) return;
    createReply.mutate({ content: replyContent.trim(), parentCommentId: parentId });
  };

  // Separate top-level comments from replies
  const topLevelComments = comments?.filter((c) => !c.parentCommentId) || [];
  const replies = comments?.filter((c) => c.parentCommentId) || [];
  const repliesByParent = replies.reduce<Record<string, TaskComment[]>>((acc, reply) => {
    const parentId = reply.parentCommentId!;
    if (!acc[parentId]) acc[parentId] = [];
    acc[parentId].push(reply);
    return acc;
  }, {});

  return (
    <div className="card p-5">
      <h3 className="mb-4 text-sm font-semibold text-slate-700">Comments</h3>

      {/* New comment form */}
      <form onSubmit={handleSubmitComment} className="mb-6">
        <textarea
          value={newComment}
          onChange={(e) => setNewComment(e.target.value)}
          placeholder="Add a comment..."
          rows={3}
          className="input mb-2 resize-none"
        />
        <div className="flex justify-end">
          <button
            type="submit"
            disabled={!newComment.trim() || createComment.isPending}
            className="btn-primary btn-sm"
          >
            {createComment.isPending ? 'Posting...' : 'Post comment'}
          </button>
        </div>
      </form>

      {/* Comments list */}
      {isLoading ? (
        <LoadingSpinner className="py-8" />
      ) : error ? (
        <ErrorDisplay message="Failed to load comments" onRetry={() => refetch()} />
      ) : topLevelComments.length === 0 ? (
        <EmptyState title="No comments yet" description="Be the first to comment." />
      ) : (
        <div className="space-y-4">
          {topLevelComments.map((comment) => (
            <div key={comment.id}>
              {/* Top-level comment */}
              <div className="rounded-lg bg-slate-50 p-4">
                <div className="mb-1 flex items-center gap-2">
                  <span className="text-sm font-medium text-slate-700">{comment.authorId}</span>
                  <span className="text-xs text-slate-400">
                    {format(new Date(comment.createdAt), 'MMM d, yyyy h:mm a')}
                  </span>
                  {comment.isEdited && <span className="text-xs text-slate-400">(edited)</span>}
                </div>
                <p className="whitespace-pre-wrap text-sm text-slate-600">{comment.content}</p>
                <button
                  onClick={() => setReplyTo(replyTo === comment.id ? null : comment.id)}
                  className="mt-2 text-xs font-medium text-primary-600 hover:text-primary-700"
                >
                  {replyTo === comment.id ? 'Cancel' : 'Reply'}
                </button>
              </div>

              {/* Replies */}
              {repliesByParent[comment.id]?.map((reply) => (
                <div key={reply.id} className="ml-6 mt-2 rounded-lg bg-slate-50 p-3">
                  <div className="mb-1 flex items-center gap-2">
                    <span className="text-sm font-medium text-slate-700">{reply.authorId}</span>
                    <span className="text-xs text-slate-400">
                      {format(new Date(reply.createdAt), 'MMM d, yyyy h:mm a')}
                    </span>
                  </div>
                  <p className="whitespace-pre-wrap text-sm text-slate-600">{reply.content}</p>
                </div>
              ))}

              {/* Reply form */}
              {replyTo === comment.id && (
                <form onSubmit={(e) => handleSubmitReply(e, comment.id)} className="ml-6 mt-2">
                  <textarea
                    value={replyContent}
                    onChange={(e) => setReplyContent(e.target.value)}
                    placeholder="Write a reply..."
                    rows={2}
                    className="input mb-2 resize-none text-sm"
                  />
                  <div className="flex justify-end">
                    <button
                      type="submit"
                      disabled={!replyContent.trim() || createReply.isPending}
                      className="btn-primary btn-sm"
                    >
                      {createReply.isPending ? 'Posting...' : 'Reply'}
                    </button>
                  </div>
                </form>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
