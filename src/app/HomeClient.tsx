"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { useEffect, useState, useMemo, useCallback, JSX } from "react";

export default function HomeClient() {
  const [activeTab, setActiveTab] = useState("tab1");

  return (
    <Tabs defaultValue="plan" className="w-full gap-6">
      <TabsList className="w-full group-data-[orientation=horizontal]/tabs:h-12">
        <TabsTrigger value="plan">Plan</TabsTrigger>
        <TabsTrigger value="myBookings">My Bookings</TabsTrigger>
        <TabsTrigger value="admin">Admin</TabsTrigger>
      </TabsList>

      <TabsContent value="plan" className="gap-6 flex flex-col"></TabsContent>

      <TabsContent
        value="myBookings"
        className="gap-6 flex flex-col"
      ></TabsContent>

      <TabsContent value="admin" className="gap-6 flex flex-col"></TabsContent>
    </Tabs>
  );
}
