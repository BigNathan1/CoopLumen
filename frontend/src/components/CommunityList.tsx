// frontend/src/components/communities/CommunityList.tsx
"use client";

import React, { useState, useMemo } from "react";
import { Search } from "lucide-react";
import { CommunityCard } from "./CommunityCard";
import type { Community } from "@/types/community";

interface CommunityListProps {
  initialCommunities: Community[];
  itemsPerPage?: number;
}

export function CommunityList({ initialCommunities, itemsPerPage = 6 }: CommunityListProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [currentPage, setCurrentPage] = useState(1);

  // Reset to page 1 when search changes
  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchQuery(e.target.value);
    setCurrentPage(1);
  };

  const filteredCommunities = useMemo(() => {
    if (!searchQuery.trim()) return initialCommunities;
    const lowerQuery = searchQuery.toLowerCase();
    return initialCommunities.filter(
      (c) =>
        c.name.toLowerCase().includes(lowerQuery) ||
        c.description.toLowerCase().includes(lowerQuery)
    );
  }, [initialCommunities, searchQuery]);

  const totalPages = Math.ceil(filteredCommunities.length / itemsPerPage);
  const paginatedCommunities = filteredCommunities.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  return (
    <div className="flex w-full flex-col gap-6">
      {/* Search Input */}
      <div className="relative max-w-md">
        <label htmlFor="community-search" className="sr-only">
          Search communities
        </label>
        <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
          <Search className="h-5 w-5 text-gray-400" aria-hidden="true" />
        </div>
        <input
          id="community-search"
          type="search"
          value={searchQuery}
          onChange={handleSearchChange}
          placeholder="Search by name or description..."
          className="block w-full rounded-lg border border-gray-300 bg-white p-2.5 pl-10 text-sm text-gray-900 focus:border-blue-500 focus:ring-blue-500 dark:border-gray-700 dark:bg-gray-900 dark:text-white dark:placeholder-gray-400 dark:focus:border-blue-500 dark:focus:ring-blue-500"
        />
      </div>

      {/* Empty State */}
      {filteredCommunities.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-gray-300 py-16 text-center dark:border-gray-800">
          <p className="text-lg font-medium text-gray-900 dark:text-gray-100">
            No communities found
          </p>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            We couldn't find any communities matching "{searchQuery}".
          </p>
        </div>
      ) : (
        <>
          {/* Community Grid */}
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {paginatedCommunities.map((community) => (
              <CommunityCard
                key={community.id}
                community={community}
                onJoin={(id) => console.log(`Requested to join ${id}`)}
              />
            ))}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="mt-8 flex items-center justify-center gap-4">
              <button
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                aria-label="Previous page"
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
              >
                Previous
              </button>
              <span className="text-sm text-gray-600 dark:text-gray-400" aria-live="polite">
                Page {currentPage} of {totalPages}
              </span>
              <button
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                aria-label="Next page"
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
              >
                Next
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}